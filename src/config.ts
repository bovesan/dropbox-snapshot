import os from 'os';

export default {
    config_path: os.homedir+'/.dsnapshot/config.json',
    token_path: os.homedir + '/.dsnapshot/token.dat',
    lockfile_path: os.homedir+'/.dsnapshot/lockfile',
    log_path: os.homedir + '/.dsnapshot/dsnapshot.log',
    authPort: 18881,
    clientId: 'irvv6l188sxowqo',
}