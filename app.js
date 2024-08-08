const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const uuid = require('uuid');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); 

let users = [];  
let messages = {}; // Store messages for conversations

io.on('connection', (socket) => {
    socket.on('signup', (username) => {
        if (users.find(user => user.username === username)) {
            socket.emit('signup-failure', 'Username already taken.');
        } else {
            const user = { username, socketId: socket.id, profilePic: `https://api.adorable.io/avatars/50/${username}.png` };
            users.push(user);
            socket.emit('signup-success', user);
            io.emit('active-users', users);
        }
    });

    socket.on('signin', (username) => {
        const user = users.find(user => user.username === username);
        if (user) {
            user.socketId = socket.id;
            socket.emit('signin-success', user);
            io.emit('active-users', users);
        } else {
            socket.emit('signin-failure', 'Username not found.');
        }
    });

    socket.on('get-active-users', () => {
        socket.emit('active-users', users);
    });

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

    socket.on('load-messages', (data) => {
        const conversation = messages[data.from]?.[data.to] || [];
        socket.emit('load-messages', conversation);
    });

    socket.on('delete-conversation', (data) => {
        if (messages[data.from]) delete messages[data.from][data.to];
        if (messages[data.to]) delete messages[data.to][data.from];
        
        io.to(users.find(user => user.username === data.to).socketId).emit('conversation-deleted');
        socket.emit('conversation-deleted');
    });

    socket.on('request-room-id', (username) => {
        const roomId = uuid.v4();
        socket.emit('room-id', roomId);
        
        const recipient = users.find(user => user.username === username);
        if (recipient && recipient.socketId) {
            io.to(recipient.socketId).emit('room-id', roomId);
        }
    });

    socket.on('join', (roomId) => {
        socket.join(roomId);
    });

    socket.on('offer', (roomId, offer) => {
        socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', (roomId, answer) => {
        socket.to(roomId).emit('answer', answer);
    });

    socket.on('ice-candidate', (roomId, candidate) => {
        socket.to(roomId).emit('ice-candidate', candidate);
    });

    socket.on('disconnect', () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('active-users', users);
    });
});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
