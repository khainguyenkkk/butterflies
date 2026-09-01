#!/usr/bin/env python3
"""HTTPS static server, for testing on a Quest over the local network.

    python3 web/tools/serve-https.py [port]

WebXR only runs in a SECURE CONTEXT. localhost counts as one, but a LAN
address does not -- so plain http://192.168.x.x works for looking at the
scene in 2D and the Enter VR button will refuse. Hence TLS.

Generates a self-signed certificate into web/tools/.cert/ on first run
(needs `openssl`, which ships with macOS). The Quest browser will warn
that the certificate is not trusted: choose Advanced -> Proceed. Once you
have, the origin is a secure context and WebXR works.

The certificate is self-signed and only for testing on your own network.
It is regenerated per machine, is not committed anywhere, and should not
be reused for anything else.
"""
import functools
import ipaddress
import os
import socket
import ssl
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(HERE))
CERTDIR = os.path.join(HERE, '.cert')
CERT = os.path.join(CERTDIR, 'dev.crt')
KEY = os.path.join(CERTDIR, 'dev.key')
HERE = os.path.dirname(os.path.abspath(__file__))
CERTDIR = os.path.join(HERE, '.cert')
CERT = os.path.join(CERTDIR, 'dev.crt')
KEY = os.path.join(CERTDIR, 'dev.key')

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
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8443


def local_ips():
    """Every IPv4 address this machine has, best candidate first.

    The obvious trick -- open a UDP socket to 8.8.8.8 and read back the
    local address -- picks whichever interface holds the DEFAULT ROUTE.
    With a VPN up that is the VPN's address (10.x here), which the Quest
    cannot reach: it is on the Wi-Fi LAN. So prefer the Wi-Fi interfaces
    explicitly, and put every address in the certificate regardless, so it
    validates whichever one you end up typing.
    """
    found = []

    def add(ip):
        if ip and ip not in found:
            try:
                a = ipaddress.ip_address(ip)
            except ValueError:
                return
            if a.is_loopback or a.is_link_local:
                return
            found.append(ip)

    # macOS Wi-Fi / Ethernet first -- this is the one the Quest shares
    for iface in ('en0', 'en1', 'en2'):
        try:
            add(subprocess.check_output(
                ['ipconfig', 'getifaddr', iface],
                stderr=subprocess.DEVNULL).decode().strip())
        except Exception:
            pass

    # then anything else the machine has
    try:
        for line in subprocess.check_output(
                ['ifconfig'], stderr=subprocess.DEVNULL).decode().splitlines():
            line = line.strip()
            if line.startswith('inet ') and 'inet6' not in line:
                add(line.split()[1])
    except Exception:
        pass

    # last resort: the default-route address
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        add(s.getsockname()[0])
    except Exception:
        pass
    finally:
        s.close()

    return found or ['127.0.0.1']


def is_private_lan(ip):
    """192.168.x and 172.16-31.x are ordinary home LANs. 10.x is too, but is
    also what most VPNs hand out, so it ranks below them."""
    return ip.startswith('192.168.') or ip.startswith('172.')


def ensure_cert(ips):
    """Create a self-signed cert covering every local address.

    The IP has to be in subjectAltName, not just the common name -- browsers
    have ignored CN for host matching for years, and without a matching SAN
    the Quest rejects the certificate outright instead of offering to
    proceed past it.
    """
    have = _cert_text()
    if have and all(('IP Address:' + ip) in have for ip in ips):
        return
    if have:
        print('certificate does not cover %s; regenerating' % ', '.join(ips))
    os.makedirs(CERTDIR, exist_ok=True)
    sans = ','.join(['IP:' + ip for ip in ips] + ['IP:127.0.0.1', 'DNS:localhost'])
    cnf = os.path.join(CERTDIR, 'openssl.cnf')
    with open(cnf, 'w') as f:
        f.write(
            "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n"
            "[dn]\nCN=%s\n"
            "[ext]\nsubjectAltName=%s\n"
            "basicConstraints=CA:FALSE\n" % (ips[0], sans))
    subprocess.check_call([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', KEY, '-out', CERT, '-days', '825', '-config', cnf],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('generated a self-signed certificate for %s' % ', '.join(ips))


def _cert_text():
    if not (os.path.exists(CERT) and os.path.exists(KEY)):
        return ''
    try:
        return subprocess.check_output(
            ['openssl', 'x509', '-in', CERT, '-noout', '-text'],
            stderr=subprocess.DEVNULL).decode()
    except Exception:
        return ''


HANDSHAKE_TIMEOUT = 20


class Server(ThreadingHTTPServer):
    """Threaded, and the TLS handshake happens in the WORKER thread.

    Both halves of that matter, and the second one is the subtle half.

    Wrapping the LISTENING socket -- ctx.wrap_socket(httpd.socket) -- is the
    usual one-liner, but it makes accept() perform the TLS handshake in the
    accept loop, before the connection is handed to a thread. A headset
    sitting on the certificate warning holds a connection in exactly that
    state, so the accept loop blocks and the whole server stops answering
    anyone, including localhost. It stays listening and alive in ps the
    entire time, which makes it look like a network problem rather than a
    server one.

    So: accept raw, hand the bare socket to a thread, and negotiate TLS
    there, where one stalled client costs one thread and nothing else.
    """

    daemon_threads = True

    def __init__(self, addr, handler, ssl_context):
        self.ssl_context = ssl_context
        ThreadingHTTPServer.__init__(self, addr, handler)

    def get_request(self):
        sock, addr = self.socket.accept()
        sock.settimeout(HANDSHAKE_TIMEOUT)   # reap clients that go quiet
        return sock, addr                    # still plaintext at this point

    def process_request_thread(self, request, client_address):
        try:
            request = self.ssl_context.wrap_socket(request, server_side=True)
        except Exception:
            # a failed or abandoned handshake is routine here: browsers open
            # speculative connections, and the certificate is self-signed
            self.shutdown_request(request)
            return
        ThreadingHTTPServer.process_request_thread(self, request, client_address)


class Handler(SimpleHTTPRequestHandler):
    # give up on a client that opens a socket and then says nothing
    timeout = 30

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')   # so a reload really reloads
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == '__main__':
    ips = local_ips()
    ensure_cert(ips)
    # rank the address the Quest is most likely to reach first
    ordered = [i for i in ips if is_private_lan(i)] + \
              [i for i in ips if not is_private_lan(i)]
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    httpd = Server(('0.0.0.0', PORT),
                   functools.partial(Handler, directory=ROOT), ctx)
    print('')
    print('  On the Quest, open:   https://%s:%d/' % (ordered[0], PORT))
    if len(ordered) > 1:
        print('')
        print('  If that does not load, this machine also answers on:')
        for alt in ordered[1:]:
            print('      https://%s:%d/' % (alt, PORT))
        print('  (addresses on 10.x are often a VPN, which the Quest cannot reach)')
    print('')
    print('  The browser will warn about the certificate.')
    print('  Advanced -> Proceed. Then the Enter VR button works.')
    print('')
    sys.stdout.flush()
    httpd.serve_forever()
