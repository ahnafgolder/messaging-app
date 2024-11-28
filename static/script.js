// Initialize Socket.IO with secure WebSocket
const socket = io({
    transports: ['websocket'],
    secure: true
});

const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message');
const userCountElement = document.getElementById('user-count');

// WebRTC configuration with multiple STUN servers
const configuration = {
    iceServers: [
        { 
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        }
    ],
    iceCandidatePoolSize: 10
};

let peerConnection;
let localStream;
let isInitiator = false;
let isConnected = false;

// Video elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startVideoButton = document.getElementById('startVideo');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleVideoButton = document.getElementById('toggleVideo');
const endCallButton = document.getElementById('endCall');

// Disable control buttons initially
toggleAudioButton.disabled = true;
toggleVideoButton.disabled = true;

// Update user count and handle connection status
socket.on('user_update', function(data) {
    if (userCountElement) {
        userCountElement.textContent = `${data.count}/2`;
        
        // If second user joins and video is already started
        if (data.count === 2 && localStream && !isConnected) {
            isInitiator = true;
            createPeerConnection();
            createOffer();
        }
    }
});

// Video call functions
async function startVideo() {
    try {
        startVideoButton.textContent = 'Requesting permissions...';
        startVideoButton.disabled = true;
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support video calls');
        }

        // Request camera and microphone permissions
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });

        // Enable control buttons
        toggleAudioButton.disabled = false;
        toggleVideoButton.disabled = false;
        startVideoButton.textContent = 'Video Started';

        // Display local video
        localVideo.srcObject = localStream;
        await localVideo.play().catch(e => console.log('Play error:', e));

        // Create peer connection if two users are present
        if (userCountElement && userCountElement.textContent.startsWith('2')) {
            isInitiator = true;
            createPeerConnection();
            createOffer();
        }
    } catch (error) {
        console.error('Error accessing media devices:', error);
        startVideoButton.textContent = 'Start Video';
        startVideoButton.disabled = false;
        alert('Error accessing camera/microphone: ' + error.message);
    }
}

function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add local stream tracks to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice_candidate', event.candidate);
            }
        };

        // Log ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
        };
        
        // Handle receiving remote stream
        peerConnection.ontrack = event => {
            if (remoteVideo.srcObject !== event.streams[0]) {
                console.log('Received remote stream');
                remoteVideo.srcObject = event.streams[0];
                isConnected = true;
            }
        };

        console.log('PeerConnection created');
    } catch (error) {
        console.error('Error creating peer connection:', error);
        alert('Error creating video connection. Please try refreshing the page.');
    }
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: true
        });
        
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
        console.log('Offer created and sent');
    } catch (error) {
        console.error('Error creating offer:', error);
        alert('Error establishing video connection. Please try refreshing the page.');
    }
}

// WebRTC signaling handlers
socket.on('offer', async function(offer) {
    console.log('Received offer');
    if (!localStream) {
        isInitiator = false;
        await startVideo();
    }
    
    try {
        if (!peerConnection) {
            createPeerConnection();
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
        console.log('Answer created and sent');
    } catch (error) {
        console.error('Error handling offer:', error);
        alert('Error connecting to peer. Please try refreshing the page.');
    }
});

socket.on('answer', async function(answer) {
    console.log('Received answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
});

socket.on('ice_candidate', async function(candidate) {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('ICE candidate added');
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Video control functions
startVideoButton.addEventListener('click', startVideo);

toggleAudioButton.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioButton.textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
        toggleAudioButton.classList.toggle('active');
    }
});

toggleVideoButton.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoButton.textContent = videoTrack.enabled ? 'Hide Video' : 'Show Video';
        toggleVideoButton.classList.toggle('active');
    }
});

// End Call functionality
document.getElementById('endCall').addEventListener('click', async () => {
    try {
        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        // Stop all tracks in local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Clear video elements
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;

        // Reset UI
        document.getElementById('startVideo').textContent = 'Start Video';
        document.getElementById('toggleAudio').textContent = 'Mute';
        document.getElementById('toggleVideo').textContent = 'Hide Video';

        // Notify other user
        socket.emit('call_ended');

        // Add status message
        appendMessage('System', 'Call ended');
    } catch (error) {
        console.error('Error ending call:', error);
        appendMessage('System', 'Error ending call');
    }
});

// Handle call ended event from other user
socket.on('call_ended', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('startVideo').textContent = 'Start Video';
    appendMessage('System', 'Other user ended the call');
});

// Handle user disconnection
window.addEventListener('beforeunload', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
});

// Chat message functions
socket.on('receive_message', function(data) {
    const messageElement = document.createElement('div');
    const username = document.querySelector('.user-info span').textContent.split(': ')[1];
    messageElement.className = `message ${data.user === username ? 'sent' : 'received'}`;
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    messageInfo.textContent = `${data.user} • ${data.timestamp}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = data.content;
    
    messageElement.appendChild(messageInfo);
    messageElement.appendChild(messageContent);
    messagesDiv.appendChild(messageElement);
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function sendMessage() {
    const message = messageInput.value.trim();
    
    if (message) {
        socket.emit('send_message', {
            message: message
        });
        messageInput.value = '';
    }
}

// Handle Enter key
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function appendMessage(user, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message system';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = `${user}: ${message}`;
    
    messageElement.appendChild(messageContent);
    messagesDiv.appendChild(messageElement);
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
