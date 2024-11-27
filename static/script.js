const socket = io({
    transports: ['websocket'],
    secure: true
});
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message');
const userCountElement = document.getElementById('user-count');

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};
let peerConnection;
let localStream;
let isInitiator = false;

// Video elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startVideoButton = document.getElementById('startVideo');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleVideoButton = document.getElementById('toggleVideo');

// Disable control buttons initially
toggleAudioButton.disabled = true;
toggleVideoButton.disabled = true;

// Update user count
socket.on('user_update', function(data) {
    if (userCountElement) {
        userCountElement.textContent = `${data.count}/2`;
    }
});

// Video call functions
async function startVideo() {
    try {
        // Request permissions explicitly
        startVideoButton.textContent = 'Requesting permissions...';
        
        // Check if browser supports getUserMedia
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
        startVideoButton.disabled = true;

        // Display local video
        localVideo.srcObject = localStream;
        await localVideo.play().catch(e => console.log('Play error:', e));

        // Create peer connection if two users are present
        if (userCountElement && userCountElement.textContent.startsWith('2')) {
            createPeerConnection();
            if (isInitiator) {
                createOffer();
            }
        }
    } catch (error) {
        console.error('Error accessing media devices:', error);
        startVideoButton.textContent = 'Start Video';
        alert('Error accessing camera/microphone: ' + error.message);
    }
}

function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add local stream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice_candidate', event.candidate);
            }
        };
        
        // Handle receiving remote stream
        peerConnection.ontrack = event => {
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                console.log('Received remote stream');
            }
        };

        console.log('PeerConnection created');
    } catch (error) {
        console.error('Error creating peer connection:', error);
    }
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
        console.log('Offer created and sent');
    } catch (error) {
        console.error('Error creating offer:', error);
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
