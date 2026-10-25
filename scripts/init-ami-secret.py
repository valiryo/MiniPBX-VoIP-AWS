"""Gera segredo AMI distinto das senhas SIP, sem exibir ou sobrescrever."""
import configparser
import os
from pathlib import Path
import re
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "secrets"


def main():
    DIRECTORY.mkdir(mode=0o700, exist_ok=True)
    password_path = DIRECTORY / "ami-password.txt"
    user_path = DIRECTORY / "ami-user.conf"
    sip_passwords = [(DIRECTORY / f"sip-{n}.txt").read_text().strip() for n in (1001, 1002)]
    if password_path.exists() or user_path.exists():
        password = password_path.read_text().strip()
        config = configparser.ConfigParser(interpolation=None)
        config.read(user_path, encoding="utf-8")
        role = config["minipbx"]
        if not re.fullmatch(r"[a-f0-9]{64}", password) or role["secret"] != password or password in sip_passwords:
            raise ValueError("Conjunto AMI inconsistente")
        if (role["deny"], role["permit"], role["read"], role["write"]) != (
            "0.0.0.0/0.0.0.0", "172.29.88.3/255.255.255.255", "system,call", "system,originate"
        ):
            raise ValueError("Permissoes AMI divergentes")
        print("Segredo AMI existente validado e preservado; nenhum valor exibido.")
        return
    password = secrets.token_hex(32)
    while password in sip_passwords:
        password = secrets.token_hex(32)
    events = ("EndpointList", "EndpointListComplete", "CoreShowChannel", "CoreShowChannelsComplete", "OriginateResponse", "Newchannel", "Newstate",
              "DialBegin", "DialEnd", "BridgeEnter", "BridgeLeave", "Hangup", "Shutdown", "FullyBooted")
    content = (f"[minipbx]\nsecret={password}\ndeny=0.0.0.0/0.0.0.0\n"
               "permit=172.29.88.3/255.255.255.255\nread=system,call\nwrite=system,originate\n"
               "writetimeout=1000\n" + "".join(
                   f"eventfilter(action(include),name({event})) =\n" for event in events))
    for path, value in ((password_path, password + "\n"), (user_path, content)):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            output.write(value)
    print("Criados secrets/ami-password.txt e ami-user.conf; nenhum segredo exibido.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, configparser.Error):
        print("Falha ao preparar AMI; confira o conjunto local. Arquivos existentes preservados.", file=sys.stderr)
        sys.exit(1)
