from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from datetime import datetime
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Store user sessions and rooms
users = {}
messages = []
MAX_USERS = 2

@app.route('/')
def index():
    if 'username' in session:
        return render_template('index.html', username=session['username'])
    return render_template('login.html', users=users)

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    if username:
        if len(users) >= MAX_USERS and username not in users:
            return "Chat room is full!", 403
        session['username'] = username
        users[username] = True
        return redirect(url_for('index'))
    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    if 'username' in session:
        username = session['username']
        users.pop(username, None)
        session.pop('username', None)
    return redirect(url_for('index'))

@socketio.on('connect')
def handle_connect():
    if 'username' in session:
        username = session['username']
        users[username] = request.sid
        emit('user_update', {'count': len(users)}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if 'username' in session:
        username = session['username']
        users.pop(username, None)
        emit('user_update', {'count': len(users)}, broadcast=True)

@socketio.on('send_message')
def handle_message(data):
    if 'username' in session and len(users) == MAX_USERS:
        message = {
            'user': session['username'],
            'content': data['message'],
            'timestamp': datetime.now().strftime('%H:%M')
        }
        messages.append(message)
        emit('receive_message', message, broadcast=True)

# WebRTC signaling
@socketio.on('offer')
def handle_offer(data):
    if len(users) == MAX_USERS:
        other_users = [sid for user, sid in users.items() if user != session['username']]
        if other_users:
            emit('offer', data, room=other_users[0])

@socketio.on('answer')
def handle_answer(data):
    if len(users) == MAX_USERS:
        other_users = [sid for user, sid in users.items() if user != session['username']]
        if other_users:
            emit('answer', data, room=other_users[0])

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    if len(users) == MAX_USERS:
        other_users = [sid for user, sid in users.items() if user != session['username']]
        if other_users:
            emit('ice_candidate', data, room=other_users[0])

if __name__ == '__main__':
    socketio.run(app, debug=True)
