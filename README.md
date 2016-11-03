# dropbox-snapshot

```
usage: dropbox-snapshot.py [-h] [-c CONFIG] [-f FOLDER] [-r ROTATIONS]
                           [-l LOCKFILE] [-t TOKEN_PATH] [-o] [-a] [-v]
                           [remote_folder [remote_folder ...]]

This program creates and rotates local backups of a user's Dropbox account.

positional arguments:
  remote_folder         Specify one or more remote folders to download.
                        Defults to all (/)

optional arguments:
  -h, --help            show this help message and exit
  -c CONFIG, --config CONFIG
                        Read/write to a custom config file (default:
                        ~/.dropbox-snapshot/config.json)
  -f FOLDER, --folder FOLDER
                        Set root folder for local backups.
  -r ROTATIONS, --rotations ROTATIONS
                        Maximum number of local sets before the oldest will be
                        discarded
  -l LOCKFILE, --lockfile LOCKFILE
                        By default, only one instance of this program should
                        run at once. If you know what your are doing, you can
                        set different lockfile paths for separate instances.
  -t TOKEN_PATH, --token_path TOKEN_PATH
                        Read/write to a custom token file (default:
                        ~/.dropbox-snapshot/token.dat)
  -o, --own             Only download files owned by current Dropbox user.
  -a, --all             Download all files in shared resources. (opposite of
                        -o)
  -v, --verbose         Verbose output.
```
