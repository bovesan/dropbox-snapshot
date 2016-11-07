#!/usr/bin/env python2.7


import sys, os, dropbox, time, argparse, json, datetime, subprocess, math, atexit, requests, logging, operator
from pprint import pprint
from functools import partial

description = """This program creates and rotates local backups of a user's Dropbox account.
Inspired by rsnapshot, but all configuration can be done through the CLI.

API app key/secret are created here: https://www.dropbox.com/developers/apps"""
default_config_path = '~/.dropbox-snapshot/config.json'
default_token_path = '~/.dropbox-snapshot/token.dat'
default_lockfile_path = '~/.dropbox-snapshot/lockfile'
log_path = '~/.dropbox-snapshot/dsnapshot.log'
DELAY = 0.00001
API_RETRY_DELAY = 5
API_RETRY_MAX = 5
total_count = 0
update_count = 0
update_bytes = 0
queue_bytes = 0
# Create a queue to communicate with the worker threads
checkpoint3 = False
listed_bytes = 0
space = 0
time_prev = 0.0
size_prev = 0.0
job_size = 0
speed = 0.0

#logging.basicConfig(format='%(message)s')


class Struct:
    def __init__(self, **entries): 
        self.__dict__.update(entries)

def abort():
    logging.warning( 'Exited after %s' % human_time(time.time() - checkpoint1) )
    logging.warning( 'Files/folders scanned: %i' % total_count )
    logging.warning( 'Files/folders updated: %i' % update_count )
    logging.warning( 'Downloaded: %s' % human_size(update_bytes) )
    #sys.exit(1)

def disk_free(path):
    return int(subprocess.Popen(['df', '-B', '1', path], stdout=subprocess.PIPE).communicate()[0].splitlines()[1].split()[3])

def avg(list_of_numbers):
    sum = 0.0
    for n in list_of_numbers:
        sum += float(n)
    return sum/float(len(list_of_numbers))

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

    time_string += '%4.2f seconds' % seconds_left
    return time_string

def check_pid(pid):        
    """ Check For the existence of a unix pid. """
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    else:
        return True


def expandstring(object):
    if type(object) is str:
        return os.path.abspath(os.path.expanduser(object))
    else:
        return object

def api_call(fun, *args, **kwargs):
    global DELAY, API_RETRY_DELAY, API_RETRY_MAX
    attempt = 0
    time.sleep(DELAY)
    done = False
    while not done and attempt < API_RETRY_MAX:
        attempt += 1
        try:
            response = fun(*args, **kwargs)
            done = True
        except dropbox.exceptions.InternalServerError as e:
            request_id, status_code, body = e
            if attempt >= API_RETRY_MAX:
                logging.error(  'There is an issue with the Dropbox server. Aborted after %i attempts.' % attempt )
                logging.error( str(e) )
                raise
            time.sleep(API_RETRY_DELAY)
        except requests.exceptions.ReadTimeout as e:
            if attempt >= API_RETRY_MAX:
                logging.error(   'Could no receive data from server. Aborted after %i attempts.' % attempt )
                logging.error( str(e) )
                raise
            time.sleep(API_RETRY_DELAY)
        except dropbox.exceptions.RateLimitError as e:
            request_id, error, backoff = e
            time.sleep(backoff)
            DELAY *= 1.1
            if attempt >= API_RETRY_MAX:
                logging.error(   'Rate limit error. Aborted after %i attempts.' % attempt )
                logging.error( str(e) )
                raise
        except dropbox.exceptions.ApiError as e:
            if attempt >= API_RETRY_MAX:
                logging.error(   'API Error. Aborted after %i attempts.' % attempt )
                logging.error( str(e) )
                raise
            time.sleep(API_RETRY_DELAY)

        except:
            raise
    return response

def authorize():
    logging.warning(    'New Dropbox API token is required' )
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

def compare_folder(dbx, remote_folder, local_folder, job_path):
    remote_folder = remote_folder.rstrip(u'/') + u'/'
    global update_count, total_count, update_bytes, queue_bytes, listed_bytes, local_files
    status(remote_folder.encode('utf8'))
    if remote_folder == '/':
        remote_list = api_call(dbx.files_list_folder, '').entries
    else:
        remote_list = api_call(dbx.files_list_folder, remote_folder).entries
    jobs = []
    total_count += 1
    if not os.path.isdir(local_folder):
        jobs.append(u'+ '+remote_folder)
    else:
        jobs.append(u'  '+remote_folder)
    #print repr(job_path)
    #print repr(jobs)
    open(job_path, 'a').write((u'\n'.join(jobs)+u'\n').encode('utf8'))
    jobs_dict = {}
    #print repr(remote_list)
    #print repr(remote_list)
    try:
        local_folder_index = os.listdir(local_folder.decode('utf8'))
    except OSError as e:
        local_folder_index = []
    for item in sorted(remote_list):
        #print repr(item.name.encode('utf8'))
        remote_path = remote_folder+item.name
        is_folder = type(item) == dropbox.files.FolderMetadata
        local_file_path = local_folder+'/'+item.name.encode('utf8').replace('//', '/')
        if item.name in local_folder_index:
            local_folder_index.remove(item.name)
        if is_folder:
            compare_folder(dbx, remote_path, local_file_path, job_path) # Because recursive list_folder does not show correct case for parent folders :(
        else:
            total_count += 1
            #logging.debug( u'[R] ' + remote_path )
            modified = False
            if not os.path.isfile(local_file_path):
                modified = True
            else:
                mtime = os.path.getmtime(local_file_path)
                mtime_dt = datetime.datetime(*time.gmtime(mtime)[:6])
                size = os.path.getsize(local_file_path)
                if mtime_dt != item.client_modified and size != item.size:
                    modified = True
            if modified:
                #logging.info( '[L] Added to download queue: ' + local_file_path )
                jobs_dict[remote_path+' %i' % item.size] = '+'
            else:
                jobs_dict[remote_path+' %i' % item.size] = ' '
            listed_bytes += item.size
    for deleted in local_folder_index:
        deleted_path = os.path.join(local_folder, deleted)
        remote_path = remote_folder.encode('utf8')+deleted
        #print '\n' + repr(deleted_path)
        if os.path.isdir(deleted_path):
            jobs_dict[remote_path+'/'] = '-'
        else:
            jobs_dict[remote_path+' 0'] = '-'
    del(local_folder_index)
    jobs = []
    for j in sorted(jobs_dict):
        jobs.append(jobs_dict[j]+' '+j)
    jobs_dict = {}
    open(job_path, 'a').write((u'\n'.join(jobs)+u'\n').encode('utf8'))

def clear_line():
    sys.stdout.write("\033[K")
    sys.stdout.flush()

def status(msg=' '):
    global space, listed_bytes, update_bytes, job_size, free_space, time_prev, size_prev, speed
    clear_line()
    if listed_bytes < space:
        progress_compare = float(listed_bytes) / float(space)
        progress_compare *= 100.0
        print '\rComparing: %5.2f%% ' % progress_compare + msg,
    else:
        progress_download = float(update_bytes) / float(job_size)
        progress_download *= 100.0
        time_now = time.time()
        size_now = float(update_bytes)
        if time_now - time_prev > 2.0:
            speed = (size_now - size_prev) / (time_now - time_prev)
            size_log = [(time.time(), update_bytes)]
            time_prev = time_now + 0.0
            size_prev = size_now + 0.0
        print '\rDownloading: %s %5.2f%% Speed: %sps ' % (human_size(job_size), progress_download, human_size(speed)) + msg,

def download_file(dbx, local_file_path, remote_path, size):
    global update_count, total_count, update_bytes, queue_bytes
    #clear_line()
    status(remote_path.encode('utf8'))
    try:
        api_call(dbx.files_download_to_file, local_file_path, remote_path)
        update_count += 1
        update_bytes += size
        queue_bytes -= size
    except:
        queue_bytes -= size
        raise



def main():
    global uid, args, queue, queue_bytes, checkpoint1, job_path, space, listed_bytes, job_size
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
    parser.add_argument("-d", "--debug", help="Extra verbose output.", action="store_true")
    args = parser.parse_args()
    config_dir = os.path.dirname(args.config)
    if not os.path.isdir(config_dir):
        #logging.info( 'Creating config directory: ' % config_dir )
        os.makedirs(config_dir)
    #logging.getLogger().addHandler(logging.StreamHandler())
    if args.verbose:
        logging.basicConfig(level=logging.INFO)
    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
    #logging.getLogger().addHandler(logging.StreamHandler())
    args.config = expandstring(args.config)
    args.folder = expandstring(args.folder)
    args.lockfile = expandstring(args.lockfile)
    args.token_path = expandstring(args.token_path)
    for i in xrange(len(args.remote_folder)):
        args.remote_folder[i] = ('/'+args.remote_folder[i].strip('/')+'/').replace('//', '/')
    try:
        if not os.path.isfile(args.config):
            open(args.config, 'w').write()
        config_raw = open(args.config).read()
    except IOError as e:
        logging.error( 'Cannot open config files for read/write: ' + args.config)
        logging.info( str(e) )
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
        logging.info( '%s: %s %s' % (key.ljust(width_key), str(value).ljust(width_value), change) )
    try:
        open(args.config, 'w').write(json.dumps(config_dict, indent=4))
    except IOError:
        logging.error( 'Could not update config file: ' + args.config )
        raise
    config = Struct(**config_dict)
    if not 'folder' in config_dict.keys():
        logging.error( 'Error: No root folder for local backups. Use the -f option to set.' )
        sys.exit(1)
    if os.path.isfile(config.lockfile):
        other_pid = open(config.lockfile).read()
        if check_pid(int(other_pid)):
            logging.error( 'Another instance is already running. Pid: %s Lockfile: %s' % (other_pid, config.lockfile) )
            sys.exit(1)
    try:
        open(config.lockfile, 'w').write(str(os.getpid()))
    except IOError as e:
        logging.error( str(e) )
        sys.exit(1)
    dbx = login(config.token_path)
    #pprint.pprint(dir(dbx))
    account_info = dbx.users_get_current_account()
    space = dbx.users_get_space_usage().used
    #print repr(account_info.account_id)
    uid = account_info.account_id
    logging.info( 'Logged in as %s, uid: %s' % (account_info.email, uid) )
    logging.info( 'Space allocated: %s' % space )
    logging.info( '\n[R] = Remote\n[L] = Local\n')
    snapshot_now = os.path.join(config.folder.encode('utf8'), datetime.datetime.now().strftime("%Y-%m-%d %H:%M").encode('utf8'))
    snapshot_previous = False
    snapshot_count = 0
    for snapshot in sorted(os.listdir(config.folder), reverse=True):
        if snapshot.endswith('temp'):
            continue
        snapshot = os.path.join(config.folder, snapshot)
        if not os.path.isdir(snapshot):
            continue
        snapshot_count += 1
        if os.path.isdir(snapshot):
            if not snapshot_previous:
                snapshot_previous = snapshot
            elif snapshot_count > config.rotations:
                snapshot_job = snapshot.replace('.incomplete', '').replace('.temp', '') + '.job'
                cmd = ['rm', '-r', snapshot]
                if os.path.isfile(snapshot_job):
                    cmd.append(snapshot_job)
                print ('Removing old snapshot: ' + snapshot)
                subprocess.call(cmd)

    checkpoint1 = time.time()
    snapshot_temp = snapshot_now+'.temp'
    snapshot_incomplete = snapshot_now+'.incomplete'
    job_path = snapshot_now+'.job'
    if snapshot_previous:
        logging.info( u'Previous snapshot: ' + snapshot_previous )
        cmd = ['cp', '-al', snapshot_previous, snapshot_temp]
        print( u'Creating new snapshot: ' + snapshot_now),
        logging.info( ' '.join(cmd) )
        subprocess.call(cmd)
        os.rename(snapshot_temp, snapshot_incomplete)
    checkpoint2 = time.time()
    print 'Created new snapshot in %s' % (human_time(checkpoint2-checkpoint1))
    #print 'Getting Dropbox remote file list ...'
    atexit.register(abort)
    for remote_folder in config.remote_folders:
        compare_folder(dbx, remote_folder, snapshot_incomplete+remote_folder, job_path)
    checkpoint3 = time.time()
    clear_line()
    print '\rCompared %i items in %s' % (total_count, human_time(checkpoint3-checkpoint2))
    logging.info('Updating local file structure and queuing downloads')
    download_queue = {}
    for line in open(job_path):
        line = line.rstrip()
        if line.startswith('#') or line == '':
            continue
        action = line[0]
        path = line[2:]
        local_path = os.path.join(snapshot_incomplete, path.lstrip('/'))
        if path.endswith('/'): # is folder
            if action == '-':
                cmd = ['rm', '-rv', local_path]
                logging.info( '- ' + local_path)
                subprocess.call(cmd)
            elif action == '+':
                logging.info( '+ ' + local_path)
                try:
                    os.makedirs(local_path)
                except OSError as e:
                    print str(e)
        else:
            path, size = path.rsplit(' ', 1)
            size = int(size)
            local_path = os.path.join(snapshot_incomplete, path.lstrip('/'))
            if action == '-':
                logging.info( '- ' + local_path)
                os.remove(local_path)
            elif action == 'u':
                os.remove(local_path)
                logging.info( 'u ' + local_path)
                download_queue[path.decode('utf8')] = size
                job_size += size
            elif action == '+':
                logging.info( '+ ' + local_path)
                download_queue[path.decode('utf8')] = size
                job_size += size
    space = listed_bytes
    checkpoint4 = time.time()
    for path, size in sorted(download_queue.items(), key=operator.itemgetter(1)):
        download_file(dbx, os.path.join(snapshot_incomplete.decode('utf8'), path.lstrip(u'/')), path, size)
    checkpoint5 = time.time()
    clear_line()
    print '\rDownloaded %s in %s' % (human_size( update_bytes ), human_time(checkpoint5-checkpoint4))
    print '%s -> %s' % (snapshot_incomplete, snapshot_now)
    os.rename(snapshot_incomplete, snapshot_now)
    print 'Files/folders updated: %i/%i' % (update_count, total_count)
    atexit._exithandlers = []

if __name__ == '__main__':
    main()