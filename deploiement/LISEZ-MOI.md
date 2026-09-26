# Quel dossier appartient à quel domaine

Le compte cPanel `binniesenglish` héberge **deux sites différents**, et leurs deux racines
se ressemblent assez pour qu'on les confonde. Ce dossier contient les fichiers qui rendent
la confusion impossible — à condition qu'ils soient en place.

| Domaine | Racine | Site servi |
|---|---|---|
| `binniesenglish.com` *(principal)* | `/home/binniesenglish/public_html` | WebSuitePro |
| `binniesenglish.net` | sa racine propre, **jamais** `public_html` | Frontend BET |

La racine du `.net` se lit avec :

```bash
uapi --user=binniesenglish DomainInfo list_domains
```

---

## Le principe : c'est le nom du fichier qui prévient

Chez Hostinger, ce qu'on voit d'abord en ouvrant un dossier, c'est la **liste des noms de
fichiers**. Un avertissement à l'intérieur d'un fichier ne se lit que si on l'ouvre ; un nom
de fichier se lit sans rien faire. D'où le préfixe `0-` — il place le repère en tête de liste :

```
0-RACINE-binniesenglish.net.txt
0-RACINE-binniesenglish.com--NE-PAS-DEPLOYER-BET-ICI.txt
```

`scripts/deployer-frontend.sh` **préserve** ces fichiers : ils sont exclus de la
synchronisation, et son garde-fou ne les prend pas pour un site étranger. Ils survivent donc
à tous les déploiements — sans quoi le repère aurait disparu au premier.

---

## Mise en place

### Racine de `binniesenglish.net`

`index.html` est une page d'attente présentable : logo, nom, « notre site est en cours de mise
en ligne ». Elle sert à deux choses — qu'un visiteur ne tombe pas sur une page vide, et que
`binniesenglish.net` affiche **autre chose** que `binniesenglish.com`, ce qui prouve d'un coup
d'œil que les deux domaines ne partagent plus la même racine. Le déploiement du site BET la
remplacera par le vrai `index.html`, ce qui est normal.

```bash
# Sur le VPS. Remplacer <RACINE-NET> par la racine réelle de binniesenglish.net,
# obtenue avec list_domains — et qui n'est PAS public_html.
RACINE_NET=<RACINE-NET>

cp /opt/bet/deploiement/binniesenglish.net/index.html                      "$RACINE_NET/"
cp /opt/bet/deploiement/binniesenglish.net/0-RACINE-binniesenglish.net.txt "$RACINE_NET/"

# Ce dossier est DÉSORMAIS la racine du site BET : on le déclare.
echo "racine du site BET — page d'attente posée le $(date '+%F %H:%M')" > "$RACINE_NET/.deploiement-bet"

chown binniesenglish:binniesenglish "$RACINE_NET"/index.html "$RACINE_NET"/0-RACINE-* "$RACINE_NET"/.deploiement-bet
chmod 644 "$RACINE_NET"/index.html "$RACINE_NET"/0-RACINE-*
```

> **Pourquoi ce `.deploiement-bet`.** Sans lui, le garde-fou du script de déploiement refuserait
> ce dossier : un `index.html` seul est indiscernable de l'entrée d'un autre site — c'est
> précisément ce qu'il doit arrêter. Le poser ici, au moment où l'on désigne cette racine comme
> celle du site BET, est un geste conscient et daté. **Ne jamais le poser dans `public_html`** :
> ce serait désarmer la protection sur le dossier même qu'elle protège.

### Racine de `binniesenglish.com`

**Le marqueur seul, jamais l'`index.html`** : ce dossier a le sien, celui de WebSuitePro.

```bash
cp /opt/bet/deploiement/binniesenglish.com/0-RACINE-*.txt /home/binniesenglish/public_html/
chown binniesenglish:binniesenglish /home/binniesenglish/public_html/0-RACINE-*
chmod 644 /home/binniesenglish/public_html/0-RACINE-*
```

### Vérifier

```bash
ls -1 /home/binniesenglish/public_html | head -3      # le marqueur .com en tête
ls -1 "$RACINE_NET"                    | head -3      # le marqueur .net en tête
curl -s https://binniesenglish.net/ | grep -o "<title>[^<]*"
curl -s https://binniesenglish.com/ | grep -o "<title>[^<]*"
```

Les deux derniers appels doivent renvoyer **deux titres différents**. S'ils renvoient le même,
les domaines partagent encore une racine et la séparation n'est pas faite.
