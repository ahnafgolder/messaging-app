let localStream = null;
let peerConnection = null;
let isCallInitiator = false;
let callInProgress = false;

const socket = io();
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startVideoButton = document.getElementById('startVideo');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleVideoButton = document.getElementById('toggleVideo');
const endCallButton = document.getElementById('endCall');
const callModal = document.getElementById('callModal');
const acceptCallButton = document.getElementById('acceptCall');
const rejectCallButton = document.getElementById('rejectCall');

// Initialize WebRTC with multiple STUN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Start call function
async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        socket.emit('call_request');
        appendMessage('System', 'Calling...');
        isCallInitiator = true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        appendMessage('System', 'Error accessing camera/microphone');
    }
}

// Initialize WebRTC connection
async function initializeCall() {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming stream
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice_candidate', event.candidate);
        }
    };

    // Enable control buttons
    toggleAudioButton.disabled = false;
    toggleVideoButton.disabled = false;
    endCallButton.disabled = false;
    startVideoButton.disabled = true;
}

// Accept call function
async function acceptCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        await initializeCall();
        
        // Create and send answer
        const offer = JSON.parse(sessionStorage.getItem('pendingOffer'));
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('call_answer', { answer });
        
        callModal.classList.remove('show');
        callInProgress = true;
        appendMessage('System', 'Call connected');
    } catch (error) {
        console.error('Error accepting call:', error);
        appendMessage('System', 'Error accepting call');
    }
}

// Handle call events
startVideoButton.addEventListener('click', startCall);

socket.on('call_request', async () => {
    if (callInProgress) {
        socket.emit('call_rejected', { reason: 'User is busy' });
        return;
    }
    
    callModal.classList.add('show');
    appendMessage('System', 'Incoming call...');
});

acceptCallButton.addEventListener('click', acceptCall);

rejectCallButton.addEventListener('click', () => {
    socket.emit('call_rejected', { reason: 'Call declined' });
    callModal.classList.remove('show');
    appendMessage('System', 'Call declined');
});

socket.on('call_rejected', (data) => {
    if (isCallInitiator) {
        appendMessage('System', `Call rejected: ${data.reason}`);
        resetCall();
    }
});

socket.on('call_answer', async (data) => {
    if (isCallInitiator) {
        try {
            await initializeCall();
            await peerConnection.setRemoteDescription(data.answer);
            callInProgress = true;
            appendMessage('System', 'Call connected');
        } catch (error) {
            console.error('Error completing call setup:', error);
            appendMessage('System', 'Error connecting call');
        }
    }
});

// Handle ICE candidates
socket.on('ice_candidate', async (candidate) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
});

// Reset call state
function resetCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    callInProgress = false;
    isCallInitiator = false;
    startVideoButton.disabled = false;
    toggleAudioButton.disabled = true;
    toggleVideoButton.disabled = true;
    endCallButton.disabled = true;
}

// End call handler
endCallButton.addEventListener('click', () => {
    socket.emit('call_ended');
    appendMessage('System', 'Call ended');
    resetCall();
});

socket.on('call_ended', () => {
    appendMessage('System', 'Call ended by other user');
    resetCall();
});

// Audio/Video toggle handlers
toggleAudioButton.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioButton.textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
        toggleAudioButton.classList.toggle('active');
    }
});

toggleVideoButton.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoButton.textContent = videoTrack.enabled ? 'Hide Video' : 'Show Video';
        toggleVideoButton.classList.toggle('active');
    }
});

// Chat functionality
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('message', { message });
        messageInput.value = '';
    }
}

document.querySelector('.send-button').addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

socket.on('message', function(data) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${data.sender === username ? 'sent' : 'received'}`;
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    messageInfo.textContent = data.sender;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = data.message;
    
    messageElement.appendChild(messageInfo);
    messageElement.appendChild(messageContent);
    messagesDiv.appendChild(messageElement);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function appendMessage(user, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message system';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = `${user}: ${message}`;
    
    messageElement.appendChild(messageContent);
    messagesDiv.appendChild(messageElement);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
