let ioInstance = null;

function initSocket(io) {
  ioInstance = io;
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join', (room) => socket.join(room));

    socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
  });
}

function emitEvent(event, payload) {
  if (ioInstance) ioInstance.emit(event, payload);
}

module.exports = { initSocket, emitEvent };
