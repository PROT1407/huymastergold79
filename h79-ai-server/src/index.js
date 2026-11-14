'use strict';

const { start } = require('./server');

if (require.main === module) {
  const server = start();
  server.on('listening', () => {
    const address = server.address();
    console.log(JSON.stringify({ msg: 'listening', port: address && address.port }));
  });
}
