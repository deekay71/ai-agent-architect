import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

// A local fixture guard, not an OS sandbox. No remote provider is configured.
const blocked = () => { throw new Error('NETWORK_DISABLED_FOR_PHASE2_SPIKE'); };
globalThis.fetch = async () => blocked();
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
syncBuiltinESMExports();
