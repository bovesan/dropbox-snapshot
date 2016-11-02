#!/usr/bin/env python2.7


import sys, os, dropbox, time, argparse, json, pprint
from functools import partial

description = """This program creates and rotates local backups of a user's Dropbox account."""
default_config_path = '~/.dropbox-snapshot/config.json'
default_token_path = '~/.dropbox-snapshot/token.dat'
default_lockfile_path = '~/.dropbox-snapshot/lockfile'

def check_pid(pid):        
    """ Check For the existence of a unix pid. """
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    else:
        return True
class Struct:
    def __init__(self, **entries): 
        self.__dict__.update(entries)

def expandstring(object):
    if type(object) is str:
        return os.path.expanduser(object)
    else:
        return object

def main():
    global uid, args
    parser = argparse.ArgumentParser(description=description)
    #parser.add_argument("-d", "--delay", help="Set a specific delay (in seconds) between calls, to stay below API rate limits.", type=float, default=False)
    parser.add_argument("-c", "--config", help="Read/write to a custom config file (default: " + default_config_path + ")", default=default_config_path)
    parser.add_argument("-f", "--folder", help="Set root folder for local backups.", default=False)
    parser.add_argument("-l", "--lockfile", help="By default, only one instance of this program should run at once. If you know what your are doing, you can set different lockfile paths for separate instances.", default=False)
    parser.add_argument("-t", "--token_path", help="Read/write to a custom token file (default: " + default_token_path + ")", default=False)
    parser.add_argument("-n", "--do_nothing", help="Do not write anything to disk. Only show what would be done.", action="store_true")
    parser.add_argument("-o", "--own", help="Only download files owned by current Dropbox user.", action="store_true")
    parser.add_argument("-a", "--all", help="Download all files in shared resources. (opposite of -o)", action="store_true")
    parser.add_argument("-v", "--verbose", help="Verbose output.", action="store_true")
    args = parser.parse_args()
    verbose = args.verbose
    args.config = expandstring(args.config)
    args.folder = expandstring(args.folder)
    args.lockfile = expandstring(args.lockfile)
    args.token_path = expandstring(args.token_path)

    config_dir = os.path.dirname(args.config)
    if not os.path.isdir(config_dir):
        if verbose: print 'Creating config directory: ' % config_dir
        os.makedirs(config_dir)
    try:
        if not os.path.isfile(args.config):
            open(args.config, 'w').write()
        config_raw = open(args.config).read()
    except IOError as e:
        print 'Cannot open config files for read/write: ' + args.config
        print str(e)
        sys.exit(1)
    try:
        config_dict = json.loads(config_raw)
    except ValueError:
        config_dict = {}
    config_dict_old = config_dict.copy()
    if args.folder:
        config_dict['folder'] = args.folder
    #pprint.pprint(config_dict)
    if args.lockfile:
        config_dict['lockfile'] = args.lockfile
    elif not 'lockfile' in config_dict.keys():
        config_dict['lockfile'] = expandstring(default_lockfile_path)
    if args.token_path:
        config_dict['token_path'] = args.token_path
    elif not 'token_path' in config_dict.keys():
        config_dict['token_path'] = expandstring(default_token_path)
    if args.own:
        config_dict['own'] = True
    elif args.all:
        config_dict['own'] = False
    elif not 'own' in config_dict.keys():
        config_dict['own'] = False
    if verbose: 
        width_key = 0
        width_value = 0
        for key, value in config_dict.iteritems():
            width_key = max(width_key, len(key))
            width_value = max(width_value, len(str(value)))
        for key, value in config_dict.iteritems():
            change = ''
            try:
                if config_dict_old[key] != value:
                    change = 'Changed from: %s' % config_dict_old[key]
            except KeyError:
                    change = 'Changed from: None'
            print '%s: %s %s' % (key.ljust(width_key), str(value).ljust(width_value), change)
    try:
        open(args.config, 'w').write(json.dumps(config_dict))
    except IOError:
        print 'Could not update config file: ' + args.config
        raise
    config = Struct(**config_dict)
    if not 'folder' in config_dict.keys():
        print 'Error: No root folder for local backups. Use the -f option to set.'
        sys.exit(1)
    if os.path.isfile(config.lockfile):
        other_pid = open(config.lockfile).read()
        if check_pid(int(other_pid)):
            print 'Another instance is already running. Pid: %s Lockfile: %s' % (other_pid, config.lockfile)
            sys.exit(1)
    try:
        open(config.lockfile, 'w').write(str(os.getpid()))
    except IOError as e:
        print str(e)
        sys.exit(1)
    print 'End of the road'
    sys.exit()
    client = login('token.dat')
    account_info = client.account_info()
    uid = account_info['uid']
    print 'Logged in as %s, uid: %s' % (account_info['email'], account_info['uid'])
    dropbox_roots = []
    try:
        for account, details in json.loads(open(os.path.expanduser('~/.dropbox/info.json')).read()).iteritems(): # Mac only
            for key, value in details.iteritems():
                if key == 'path':
                    dropbox_roots.append(os.path.realpath(value))
    except IOError:
        pass
    for root_path_encoded in config.folder:
        root_path = root_path_encoded.decode(sys.stdin.encoding)
        if os.path.exists(root_path):
            root_path = os.path.realpath(root_path)
            for dropbox_root in dropbox_roots:
                root_path = root_path.replace(dropbox_root, '')
        restore_folder(client, root_path, cutoff_datetime, verbose=True)


if __name__ == '__main__':
    main()