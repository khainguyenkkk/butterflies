#!/usr/bin/env python3
"""Tiny static server for local + Quest testing.

    python3 web/tools/serve.py [port]

Serves the folder containing index.html, found by walking up.
For the Quest: `adb reverse tcp:8123 tcp:8123`, then open
http://localhost:8123/ in the headset browser -- localhost counts
as a secure context, so WebXR works without HTTPS.

(Uses an explicit root rather than `python3 -m http.server`, whose
argparse defaults call os.getcwd() at import time and trip sandboxes.)
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def find_root():
    """The directory holding index.html, found by walking up from this script.

    Written this way so the same script works from `web/tools/` in the
    working tree and from `versions/vN/tools/` in a snapshot, which sit at
    different depths. Hard-coding the number of dirname() calls silently
    served the wrong folder from a snapshot.
    """
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        d = os.path.dirname(d)
        if os.path.exists(os.path.join(d, 'index.html')):
            return d
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT = find_root()
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class Server(ThreadingHTTPServer):
    # THREADING MATTERS HERE, it is not a nicety.
    #
    # A plain HTTPServer handles one connection at a time. A headset sitting
    # on the certificate warning holds its socket open while the person reads
    # it, and a single-threaded server blocks there forever -- every later
    # request, even from localhost, hangs with no error and no log line. The
    # server looks alive in ps and netstat the whole time.
    daemon_threads = True
    # so a half-open connection retires instead of occupying a thread for good
    timeout = 30


class Handler(SimpleHTTPRequestHandler):
    # give up on a client that opens a socket and then says nothing
    timeout = 30

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == '__main__':
    h = functools.partial(Handler, directory=ROOT)
    print('serving %s on http://localhost:%d/' % (ROOT, PORT))
    sys.stdout.flush()
    Server(('0.0.0.0', PORT), h).serve_forever()
