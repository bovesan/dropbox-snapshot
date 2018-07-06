#!/usr/bin/env python2.7

import argparse
import atexit
import dropbox
import json
import logging
import math
import os
import sys
import time

DESCRIPTION = """This program creates and rotates local backups of a user's Dropbox account.
Inspired by rsnapshot, but all configuration can be done through the CLI.

API app key/secret are created here: https://www.dropbox.com/developers/apps"""

DEFAULT_CONFIG_PATH = '~/.dropbox-snapshot/config.json'
DEFAULT_TOKEN_PATH = '~/.dropbox-snapshot/token.dat'
DEFAULT_LOCKFILE_PATH = '~/.dropbox-snapshot/lockfile'
DEFAULT_LOGFILE_PATH = '~/.dropbox-snapshot/dsnapshot.log'
DEFAULT_ROTATIONS = 10

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

def human_size(num, suffix='B'):
    for unit in ['','Ki','Mi','Gi','Ti','Pi','Ei','Zi']:
        if abs(num) < 1024.0:
            return "%3.1f %s%s" % (num, unit, suffix)
        num /= 1024.0
    return "%.1f%s%s" % (num, 'Yi', suffix)

def human_time(seconds):
    time_string = ''
    seconds_left = seconds

    day = ( 24 * 60 * 60 )
    days = math.floor(seconds_left / day)
    seconds_left = seconds_left - (days * day)
    if days == 1:
        time_string += '1 day, '
    elif days > 1:
        time_string += '%i days, ' % days

    hour = ( 60 * 60 )
    hours = math.floor(seconds_left / hour)
    seconds_left = seconds_left - (hours * hour)
    if hours == 1:
        time_string += '1 hour, '
    elif hours > 1:
        time_string += '%i hours, ' % hours

    minute = 60
    minutes = math.floor(seconds_left / minute)
    seconds_left = seconds_left - (minutes * minute)
    if minutes == 1:
        time_string += '1 minute, '
    elif minutes > 1:
        time_string += '%i minutes ' % minutes

    if time_string != '':
        time_string += 'and '

    time_string += '%i seconds' % seconds_left
    return time_string

class Session:
    config = None
    timeStart = 0
    countScanned = 0
    countUpdated = 0
    bytesDownloaded = 0
    def __init__(self, config):
        self.config = config
        self.timeStart = time.time()
        if self.config.folder == None:
            logging.error( 'Error: No root folder for local backups. Use the -f option to set.' )
            sys.exit(1)
        dbx = self.login()
        account_info = dbx.users_get_current_account()
        space = dbx.users_get_space_usage().used
        uid = account_info.account_id
        logging.info( 'Logged in as %s, uid: %s' % (account_info.email, uid) )
        logging.info( 'Account size: ' + human_size(space))
        atexit.register(self.aborted)
    def authorize(self):
        logging.warning( 'New Dropbox API token is required' )
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
    def login(self):
        if os.path.exists(self.config.tokenpath):
            with open(self.config.tokenpath) as token_file:
                access_token = token_file.read()
        else:
            access_token = self.authorize()
            with open(self.config.tokenpath, 'w') as token_file:
                token_file.write(access_token)
        return dropbox.Dropbox(access_token)
    def aborted(self):
        logging.warning( 'Exited after %s' % human_time(time.time() - self.timeStart) )
        logging.warning( 'Files/folders scanned: %i' % self.countScanned )
        logging.warning( 'Files/folders updated: %i' % self.countUpdated )
        logging.warning( 'Downloaded: %s' % human_size(self.bytesDownloaded) )


class Config:
    folder = None
    remoteFolders = ['/']
    rotations = DEFAULT_ROTATIONS
    lockfilepath = expandstring(DEFAULT_LOCKFILE_PATH)
    tokenpath = expandstring(DEFAULT_TOKEN_PATH)
    own = False
    def __init__(self, path=DEFAULT_CONFIG_PATH):
        self.path = path
        self.read()
    def read(self):
        try:
            if not os.path.isdir(os.path.dirname(self.path)):
                try:
                    os.makedirs(os.path.dirname(self.path))
                except (OSError, IOError) as e:
                    logging.error( 'Cannot create config folder: ' + os.path.dirname(self.path))
                    logging.info( str(e) )
                    sys.exit(1)
            if not os.path.isfile(self.path):
                open(self.path, 'w').write('')
            config_raw = open(self.path).read()
        except IOError as e:
            logging.error( 'Cannot open config files for read/write: ' + self.path)
            logging.info( str(e) )
            sys.exit(1)
        try:
            config_dict = json.loads(config_raw)
        except ValueError:
            config_dict = {}
        for key, value in config_dict.iteritems():
            setattr(self, key, value)
    def write(self):
        open(self.path, 'w').write(json.dumps(self.__dict__, sort_keys=True, indent=4, separators=(',', ': ')))

def pathCleanup(path):
    return ('/'+path.strip('/')+'/').replace('//', '/')

def argParser():
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("-c", "--configpath", help="Read/write to a custom config file (default: " + DEFAULT_CONFIG_PATH + ")", default=DEFAULT_CONFIG_PATH)
    parser.add_argument("-f", "--folder", help="Set root folder for local backups.", default=False)
    parser.add_argument("remote_folders", nargs='*', help='Specify one or more remote folders to download. Defults to all (/)')
    parser.add_argument("-r", "--rotations", help="Maximum number of local sets before the oldest will be discarded", type=int)
    parser.add_argument("-j", "--job", help="Resume an existing .job", default=False)
    parser.add_argument("-l", "--lockfilepath", help="By default, only one instance of this program should run at once. If you know what your are doing, you can set different lockfile paths for separate instances (default: " + DEFAULT_LOCKFILE_PATH + ")", default=False)
    parser.add_argument("-t", "--tokenpath", help="Read/write to a custom token file (default: " + DEFAULT_TOKEN_PATH + ")", default=False)
    #parser.add_argument("-n", "--do_nothing", help="Do not write anything to disk. Only show what would be done.", action="store_true")
    parser.add_argument("-o", "--own", help="Only download files owned by current Dropbox user.", action="store_true")
    parser.add_argument("-a", "--all", help="Download all files in shared resources. (opposite of -o)", action="store_true")
    parser.add_argument("-v", "--verbose", help="Verbose output.", action="store_true")
    parser.add_argument("-d", "--debug", help="Extra verbose output.", action="store_true")
    args = parser.parse_args()
    args.configpath = expandstring(args.configpath)
    args.folder = expandstring(args.folder)
    args.lockfilepath = expandstring(args.lockfilepath)
    args.tokenpath = expandstring(args.tokenpath)
    if args.verbose:
        logging.basicConfig(level=logging.INFO)
    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
    for key, value in enumerate(args.remote_folders):
        args.remote_folders[key] = pathCleanup(value)
    config = Config(args.configpath)
    if args.folder:
        config.folder = args.folder
    if args.remote_folders:
        config.remote_folders = args.remote_folders
    if args.rotations:
        config.rotations = args.rotations
    if args.lockfilepath:
        config.lockfilepath = args.lockfilepath
    if args.tokenpath:
        config.tokenpath = args.tokenpath
    if args.own:
        config.own = True
    elif args.all:
        config.own = False

    if os.path.isfile(config.lockfilepath):
        other_pid = open(config.lockfilepath).read()
        if check_pid(int(other_pid)):
            logging.error( 'Another instance is already running. Pid: %s Lockfile: %s' % (other_pid, config.lockfilepath) )
            sys.exit(1)
    try:
        open(config.lockfilepath, 'w').write(str(os.getpid()))
    except IOError as e:
        logging.error( str(e) )
        sys.exit(1)
    config.write()
    session = Session(config)

if __name__ == '__main__':
    argParser()