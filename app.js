
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const uuid = require('uuid');
const path = require('path');

// Initialize express app and create server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check route to ensure server is running
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Initialize data structures
let users = [];  
let messages = {}; // Store messages for conversations

// Handle WebSocket connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // User sign-up event
    socket.on('signup', (username) => {
        if (users.find(user => user.username === username)) {
            socket.emit('signup-failure', 'Username already taken.');
        } else {
            const user = { 
                username, 
                socketId: socket.id, 
                profilePic: `https://api.adorable.io/avatars/50/${username}.png` 
            };
            users.push(user);
            socket.emit('signup-success', user);
            io.emit('active-users', users); // Notify all clients about active users
        }
    });

    // User sign-in event
    socket.on('signin', (username) => {
        const user = users.find(user => user.username === username);
        if (user) {
            user.socketId = socket.id;
            socket.emit('signin-success', user);
            io.emit('active-users', users); // Notify all clients about active users
        } else {
            socket.emit('signin-failure', 'Username not found.');
        }
    });

    // Retrieve active users
    socket.on('get-active-users', () => {
        socket.emit('active-users', users);
    });

    // Sending a message
    socket.on('send-message', (data) => {
        if (!messages[data.from]) messages[data.from] = {};
        if (!messages[data.to]) messages[data.to] = {};

        if (!messages[data.from][data.to]) messages[data.from][data.to] = [];
        if (!messages[data.to][data.from]) messages[data.to][data.from] = [];

        messages[data.from][data.to].push({ from: data.from, message: data.message });
        messages[data.to][data.from].push({ from: data.from, message: data.message });

        io.to(users.find(user => user.username === data.to).socketId).emit('receive-message', data);
        socket.emit('receive-message', data);
    });

    // Load previous messages for a conversation
    socket.on('load-messages', (data) => {
        const conversation = messages[data.from]?.[data.to] || [];
        socket.emit('load-messages', conversation);
    });

    // Delete conversation messages
    socket.on('delete-conversation', (data) => {
        if (messages[data.from]) delete messages[data.from][data.to];
        if (messages[data.to]) delete messages[data.to][data.from];

        io.to(users.find(user => user.username === data.to).socketId).emit('conversation-deleted');
        socket.emit('conversation-deleted');
    });

    // Request to start an audio call
    socket.on('request-room-id', (username) => {
        const roomId = uuid.v4();
        socket.emit('room-id', roomId);

        const recipient = users.find(user => user.username === username);
        if (recipient && recipient.socketId) {
            io.to(recipient.socketId).emit('room-id', roomId);
        }
    });

    // Joining a room for an audio call
    socket.on('join', (roomId) => {
        socket.join(roomId);
    });

    // Handle WebRTC offer
    socket.on('offer', (roomId, offer) => {
        socket.to(roomId).emit('offer', offer);
    });

    // Handle WebRTC answer
    socket.on('answer', (roomId, answer) => {
        socket.to(roomId).emit('answer', answer);
    });

    // Handle ICE candidates
    socket.on('ice-candidate', (roomId, candidate) => {
        socket.to(roomId).emit('ice-candidate', candidate);
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('active-users', users); // Notify all clients about active users
        console.log('A user disconnected:', socket.id);
    });
});

// Start the server and listen on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});



