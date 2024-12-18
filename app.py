from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, emit
from datetime import datetime
import secrets

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(16)
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=60)

# Store connected users and their session IDs
users = {}
connected_users = set()

@app.route('/')
def index():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('index.html', username=session['username'])

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        if username and len(connected_users) < 2 and username not in connected_users:
            session['username'] = username
            connected_users.add(username)
            return redirect(url_for('index'))
        return render_template('login.html', error="Room is full or username is taken")
    return render_template('login.html')

@app.route('/logout')
def logout():
    if 'username' in session:
        connected_users.discard(session['username'])
        session.pop('username', None)
    return redirect(url_for('login'))

@socketio.on('connect')
def handle_connect():
    if 'username' in session:
        users[request.sid] = session['username']
        emit('user_update', {'count': len(connected_users)}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in users:
        username = users[request.sid]
        connected_users.discard(username)
        users.pop(request.sid)
        emit('user_update', {'count': len(connected_users)}, broadcast=True)

@socketio.on('send_message')
def handle_message(data):
    if 'username' in session:
        timestamp = datetime.now().strftime('%I:%M %p')
        emit('receive_message', {
            'user': session['username'],
            'content': data['message'],
            'timestamp': timestamp
        }, broadcast=True)

# WebRTC Signaling
@socketio.on('offer')
def handle_offer(data):
    emit('offer', data, broadcast=True, include_self=False)

@socketio.on('answer')
def handle_answer(data):
    emit('answer', data, broadcast=True, include_self=False)

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    emit('ice_candidate', data, broadcast=True, include_self=False)

@socketio.on('call_ended')
def handle_call_ended():
    """Handle call ended event"""
    room = session.get('room')
    if room:
        emit('call_ended', room=room, skip_sid=request.sid)

@socketio.on('call_request')
def handle_call_request():
    """Handle incoming call request"""
    room = session.get('room')
    if room:
        emit('call_request', room=room, skip_sid=request.sid)

@socketio.on('call_rejected')
def handle_call_rejected(data):
    """Handle call rejection"""
    room = session.get('room')
    if room:
        emit('call_rejected', data, room=room, skip_sid=request.sid)

@socketio.on('call_answer')
def handle_call_answer(data):
    """Handle call answer"""
    room = session.get('room')
    if room:
        emit('call_answer', data, room=room, skip_sid=request.sid)

if __name__ == '__main__':
    socketio.run(app, debug=True)
