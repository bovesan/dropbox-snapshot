#!/usr/bin/env python2.7


import sys, os, dropbox, time, argparse, json, datetime, subprocess, math
from pprint import pprint
from functools import partial

description = """This program creates and rotates local backups of a user's Dropbox account."""
default_config_path = '~/.dropbox-snapshot/config.json'
default_token_path = '~/.dropbox-snapshot/token.dat'
default_lockfile_path = '~/.dropbox-snapshot/lockfile'
DELAY = 0.00001
total_count = 0
update_count = 0
update_bytes = 0

def human_size(num, suffix='B'):
    for unit in ['','Ki','Mi','Gi','Ti','Pi','Ei','Zi']:
        if abs(num) < 1024.0:
            return "%3.1f %s%s" % (num, unit, suffix)
        num /= 1024.0
    return "%.1f%s%s" % (num, 'Yi', suffix)


def human_time(seconds):
    time_string = ''

    day = ( 24 * 60 * 60 )
    days = math.floor(seconds / day)
    seconds_left = seconds - (days * day)
    if days == 1:
        time_string += '1 day, '
    elif days > 1:
        time_string += '%i days, ' % days

    hour = ( 60 * 60 )
    hours = math.floor(seconds / hour)
    seconds_left = seconds - (hours * hour)
    if hours == 1:
        time_string += '1 hour, '
    elif hours > 1:
        time_string += '%i hours, ' % hours

    minute = 60
    minutes = math.floor(seconds / minute)
    seconds_left = seconds - (minutes * minute)
    if minutes == 1:
        time_string += '1 minute, '
    elif minutes > 1:
        time_string += '%i minutes ' % minutes

    if time_string != '':
        time_string += 'and '

    time_string += '%s seconds' % seconds_left
    return time_string

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
        return os.path.abspath(os.path.expanduser(object))
    else:
        return object

def api_call(fun, *args, **kwargs):
    global DELAY
    time.sleep(DELAY)
    done = False
    while not done:
        try:
            response = fun(*args, **kwargs)
            done = True
        except dropbox.rest.ErrorResponse as e:
            if str(e).startswith('[503]'):
                time.sleep(float(str(e).strip().split()[-1]))
                DELAY *= 1.1
            else:
                raise
    return response

def authorize():
    print 'New Dropbox API token is required'
    APP_KEY = raw_input('App key: ')
    APP_SECRET = raw_input('App secret: ')
    flow = dropbox.client.DropboxOAuth2FlowNoRedirect(APP_KEY, APP_SECRET)
    authorize_url = flow.start()
    print('1. Go to: ' + authorize_url)
    print('2. Click "Allow" (you might have to log in first)')
    print('3. Copy the authorization code.')
    try:
        input = raw_input
    except NameError:
        pass
    code = input("Enter the authorization code here: ").strip()
    access_token, user_id = flow.finish(code)
    return access_token

def login(token_save_path):
    if os.path.exists(token_save_path):
        with open(token_save_path) as token_file:
            access_token = token_file.read()
    else:
        access_token = authorize()
        with open(token_save_path, 'w') as token_file:
            token_file.write(access_token)
    return dropbox.Dropbox(access_token)

def download_folder(dbx, remote_folder, local_folder):
    global update_count, total_count, update_bytes
    if verbose: print u'[R] '+remote_folder,
    total_count += 1
    local_folder_path = os.path.join(local_folder, remote_folder.strip(u'/'))+u'/'
    if not os.path.isdir(local_folder_path):
        if verbose: print u'-> [L] ' + local_folder_path
        try:
            os.makedirs(local_folder_path)
            update_count += 1
        except OSError as e:
            print str(e)
            return False
    else:
        if verbose: print ''
    remote_list = list_folder(dbx, remote_folder)
    for key in sorted(remote_list):
        remote_path = remote_folder+key
        is_folder = type(remote_list[key]) == dropbox.files.FolderMetadata
        if is_folder:
            download_folder(dbx, remote_path+'/', local_folder)
        else:
            if verbose: print u'[R] ' + remote_path,
            total_count += 1
            local_file_path = local_folder_path+key
            modified = False
            if not os.path.isfile(local_file_path):
                modified = True
            else:
                mtime = os.path.getmtime(local_file_path)
                mtime_dt = datetime.datetime(*time.gmtime(mtime)[:6])
                size = os.path.getsize(local_file_path)
                if mtime_dt != remote_list[key].client_modified and size != remote_list[key].size:
                    modified = True
            if modified:
                if verbose: print u'-> [L] ' + local_file_path
                try:
                    api_call(dbx.files_download_to_file, local_file_path, remote_path)
                    update_count += 1
                    update_bytes += remote_list[key].size
                except dropbox.exceptions.ApiError, IOError as e:
                    print str(e)
            else:
                if verbose: print ''


def list_folder(dbx, path):
    """List a folder.
    Return a dict mapping unicode filenames to
    FileMetadata|FolderMetadata entries.
    """
    while '//' in path:
        path = path.replace('//', '/')
    path = path.rstrip('/')
    try:
        res = api_call(dbx.files_list_folder, path)
    except dropbox.exceptions.ApiError as err:
        raise
        print('Folder listing failed for', path, '-- assumped empty:', err)
        return {}
    else:
        rv = {}
        for entry in res.entries:
            rv[entry.name] = entry
        return rv

def download(dbx, remote_path, local_path):
    """Download a file.
    Return the bytes of the file, or None if it doesn't exist.
    """
    try:
        md, res = dbx.files_download(path)
    except dropbox.exceptions.HttpError as err:
        print('*** HTTP error', err)
        return None
    data = res.content
    print(len(data), 'bytes; md:', md)
    return data

def main():
    global uid, args, verbose
    parser = argparse.ArgumentParser(description=description)
    #parser.add_argument("-d", "--delay", help="Set a specific delay (in seconds) between calls, to stay below API rate limits.", type=float, default=False)
    parser.add_argument("-c", "--config", help="Read/write to a custom config file (default: " + default_config_path + ")", default=default_config_path)
    parser.add_argument("-f", "--folder", help="Set root folder for local backups.", default=False)
    parser.add_argument("remote_folder", nargs='*', help='Specify one or more remote folders to download. Defults to all (/)')
    parser.add_argument("-r", "--rotations", help="Maximum number of local sets before the oldest will be discarded", type=int)
    parser.add_argument("-l", "--lockfile", help="By default, only one instance of this program should run at once. If you know what your are doing, you can set different lockfile paths for separate instances.", default=False)
    parser.add_argument("-t", "--token_path", help="Read/write to a custom token file (default: " + default_token_path + ")", default=False)
    #parser.add_argument("-n", "--do_nothing", help="Do not write anything to disk. Only show what would be done.", action="store_true")
    parser.add_argument("-o", "--own", help="Only download files owned by current Dropbox user.", action="store_true")
    parser.add_argument("-a", "--all", help="Download all files in shared resources. (opposite of -o)", action="store_true")
    parser.add_argument("-v", "--verbose", help="Verbose output.", action="store_true")
    args = parser.parse_args()
    verbose = args.verbose
    args.config = expandstring(args.config)
    args.folder = expandstring(args.folder)
    args.lockfile = expandstring(args.lockfile)
    args.token_path = expandstring(args.token_path)
    for i in xrange(len(args.remote_folder)):
        args.remote_folder[i] = '/'+args.remote_folder[i].strip('/')+'/'
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
    if args.remote_folder:
        config_dict['remote_folders'] = args.remote_folder
    elif not 'remote_folders' in config_dict.keys():
        config_dict['remote_folders'] = ['/']
    if args.rotations:
        config_dict['rotations'] = args.rotations
    elif not 'rotations' in config_dict.keys():
        config_dict['rotations'] = 10
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
        open(args.config, 'w').write(json.dumps(config_dict, indent=4))
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
    dbx = login(config.token_path)
    #pprint.pprint(dir(dbx))
    account_info = dbx.users_get_current_account()
    #print repr(account_info.account_id)
    uid = account_info.account_id
    if verbose: print '\nLogged in as %s, uid: %s' % (account_info.email, uid)
    if verbose: print '\n[R] = Remote\n[L] = Local\n'
    snapshot_now = os.path.join(config.folder.encode('utf8'), datetime.datetime.now().strftime("%Y-%m-%d %H:%M").encode('utf8'))
    snapshot_previous = False
    snapshot_count = 0
    for snapshot in sorted(os.listdir(config.folder), reverse=True):
        snapshot_count += 1
        snapshot = os.path.join(config.folder, snapshot)
        if os.path.isdir(snapshot):
            if not snapshot_previous:
                snapshot_previous = snapshot
            elif snapshot_count > config.rotations:
                cmd = ['rm', '-r', snapshot]
                if verbose: print 'Removing old snapshot:',
                print ' '.join(cmd)
                subprocess.call(cmd)

    if verbose: print u'Previous snapshot: ' + snapshot_previous
    checkpoint1 = time.time()
    if snapshot_previous:
        cmd = ['cp', '-al', snapshot_previous, snapshot_now]
        if verbose:
            print u'Creating a new snapshot at ' + snapshot_now
            print ' '.join(cmd)
        subprocess.call(cmd)
    checkpoint2 = time.time()
    for remote_folder in config.remote_folders:
        download_folder(dbx, remote_folder.encode('utf8'), snapshot_now)
    checkpoint3 = time.time()
    print ''
    print 'Copying previous snapshot: %s' % human_time(checkpoint2 - checkpoint1)
    print 'Dropbox comminucation: %s' % human_time(checkpoint3 - checkpoint2)
    print 'Files/folders updated: %s' % update_count
    print 'Downloaded: %s' % human_size(update_bytes)


if __name__ == '__main__':
    main()