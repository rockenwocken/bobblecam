# ★ BOBBLECAM ★ ボブルカム

Eine Goo-Kamera fürs Handy im Arcade-Look von [STARSHOT](https://github.com/rockenwocken/starshot): Foto machen, dann wie in *Kai's Power Goo* das Gesicht verschmieren, aufblasen, schrumpfen und verdrehen.

**Ablauf:** **PRESS START** → **SHOT!** → zufällige Start-Ansage → das Photo-Girl fährt von unten bis zur Hüfte ins Bild, schneller Countdown **3 · 2 · 1** → **BOBBLE UP!** → ganzer Bildschirm wird weiß (Blitz) und das Foto wird gemacht → Girl fährt wieder runter → Hintergrund weg → Goo-Editor mit zufälligem End-Sound.

**Blitz:** Bei der Selfie-Kamera wird immer der ganze Bildschirm kurz weiß, das leuchtet das Gesicht an (am besten Bildschirmhelligkeit hoch). Bei der Rückkamera prüft die App die Helligkeit und schaltet bei Dunkelheit kurz die Taschenlampe als Blitz ein.

## Hintergrund entfernen

Der **✂**-Knopf neben dem Auslöser schaltet um zwischen **NO BG** (pink, Hintergrund wird nach dem Foto entfernt) und **BG ON** (Foto bleibt wie es ist). Die Einstellung wird gemerkt.

Freigestellt wird mit MediaPipe Selfie Segmentation, komplett lokal auf dem Handy (Modell liegt in `assets/mediapipe/`). Hinter der freigestellten Person erscheint ein Arcade-Strahlenhintergrund, der auch im Video landet. Funktioniert am besten mit Gesicht und Oberkörper; findet es niemanden, bleibt das normale Foto.

## Der Goo-Editor

| Knopf | Was passiert |
|---|---|
| **SMEAR** | Finger ziehen: das Bild klebt am Finger und wird mitgezogen (Liquify) |
| **GROW** | Finger gedrückt halten: das Bild unter dem Finger bläht sich auf, je länger, desto mehr |
| **SHRINK** | Gedrückt halten: das Bild zieht sich zusammen |
| **SWIRL** | Gedrückt halten: das Bild dreht sich zum Strudel. Nochmal auf SWIRL tippen = andere Richtung (pink ↻ / lila ↺) |
| **UNGOO** | Darüberwischen: diese Stelle wird wieder normal |
| **UNDO** | Letzten Pinselstrich zurück (bis zu 30) |
| **SIZE** | Antippen (Knopf blinkt gelb, „DRAG!“), dann mit dem Finger auf dem Bild ziehen: der Ring wächst mit, loslassen = fertig |
| **NEW** | Neues Foto (zweimal tippen, wenn schon gegoot wurde) |
| **➜ NEXT** | Weiter zur Auswahl: LOOP oder TALK |

## Auswahl: LOOP oder TALK

Nach **➜ NEXT** stehen zwei umrandete Kacheln zur Wahl, ◀ EDIT geht zurück in den Editor.

**LOOP** (Kachel zeigt dein Bild live wackelnd): Das Bild wackelt in einer Schleife zwischen Original und Goo-Version, der Schieberegler stellt die Geschwindigkeit ein (4 s bis 0,4 s pro Wackler).
- **SAVE** speichert die Animation als Video (MP4, sonst WebM), mind. 3 Sekunden
- **SHARE** schickt das Video übers Teilen-Menü (blinkt der Knopf pink, nochmal tippen)

**TALK** (Kachel mit dem Mund): Das Mikrofon steuert das Bild. Still = Vorher, je lauter, desto mehr Goo, zappelig wie ein sprechender Mund. Der Pegel läuft als LED-Anzeige unter dem Bild mit.
- **HOLD** gedrückt halten = Aufnahme (max. 10 s, Restzeit im Knopf), loslassen = fertig
- danach läuft die Aufnahme in Schleife, das Bild wackelt genau wie aufgenommen
- **PITCH-Rad** rechts neben dem Bild: nach oben ziehen = höher, nach unten = tiefer, bis zu 2 Oktaven (±24 Halbtöne) in jede Richtung, die Länge bleibt gleich. Das Rad bleibt stehen, wo man es loslässt, Doppeltipp = zurück auf 0
- **SAVE** (Video mit dem gepitchten Ton), **SHARE**, **AGAIN** (neu aufnehmen). Das Video wird dafür einmal in Echtzeit aufgenommen

Kamera und Mikrofon werden beim PRESS START zusammen freigegeben.

Bei GROW/SHRINK/SWIRL kann man den Finger beim Halten auch bewegen. Jedes Werkzeug hat sein eigenes, live synthetisiertes Geräusch.

Tastatur am Laptop: **Leertaste** = Start/Shot, **1–5** = Werkzeug, **Strg/⌘+Z** = Undo.

### Wie das Goo funktioniert

Das Foto selbst wird nie verändert. `js/goo.js` hält ein Verschiebungsfeld (ein Punkt alle 4 px): jedes Ausgabepixel zeigt das Foto an „seiner Stelle + Verschiebung". Die Werkzeuge schreiben nur dieses Feld um, die Grafikkarte (WebGL2) setzt das Bild jedes Frame neu zusammen. Dadurch lassen sich beliebig viele Effekte stapeln, ohne dass das Bild matschig wird, und UNGOO kann wirklich zurück zum Original malen.

## Starten

Die Kamera braucht HTTPS, also über **GitHub Pages**:
*Settings → Pages → Source: Deploy from a branch → `main` / root*.
Danach läuft die App unter `https://rockenwocken.github.io/bobblecam/`.
Auf dem Handy in Chrome öffnen → Menü → *Zum Startbildschirm hinzufügen* für Vollbild.

Lokal testen: `python3 -m http.server` im Ordner starten und `http://localhost:8000` öffnen.

## Look

Knöpfe, Regler, Rahmen, Pegel und Pitch-Rad sind im 8-Bit-Arcade-Stil (eckige Pixel, harte Schatten, flache Farben). Logo, Banner und Countdown bleiben bewusst im Cartoon-Stil als Kontrast.

## Anpassen

| Datei | Inhalt |
|---|---|
| `js/cutout.js` + `assets/mediapipe/` | Hintergrund entfernen |
| `js/export.js` | Video-Aufnahme für LOOP |
| `js/mouth.js` + `js/worklets.js` | TALK: Mikrofon-Pegel, Aufnahme, Pitch-Shifter, Video mit Ton |
| `js/pixel-icons.js` | 8-Bit-Symbole der Knöpfe (9×9 Pixel, als Text-Raster zum Selbermalen) |
| `js/goo.js` | Goo-Engine: Verschiebungsfeld, Werkzeuge, WebGL-Rendering |
| `js/app.js` | Ablauf, Pinselgrößen (`R_MIN`, `R_MAX`), Werkzeug-Stärke (`RATE`), Countdown-Tempo (`COUNT_STEP`, `VOICE_WAIT`) |
| `js/sfx.js` | Alle Geräusche, Goo-Sounds ganz unten (`squish`, `gooHold`) |
| `js/start-sounds.js` + `assets/start/` | Start-Ansagen (eine zufällig bei SHOT!) |
| `js/end-sounds.js` + `assets/end/` | End-Sounds (einer zufällig, wenn der Editor aufgeht) |

## Credits

Alle Sounds sind gekürzt, lautstärke-angeglichen und als MP3 gespeichert (End-Sounds max. 7 s).

Start-Ansagen von [Freesound.org](https://freesound.org):
- synergyxxx69: „so dance“-Reihe (#482374, #482375, #482377, #482379)
- unfa: scream let's go (#188488)
- reitanna: let's go (#241581), oh yes (#242693)
- legnalegna55: oh yeah (#539277)
- mt4000: ready let's go high (#664605)
- ok let's go (turbopoliep)

End-Sounds: aus Sound-Sammlungen im Netz, nur für private Nutzung.

Freisteller: [MediaPipe Selfie Segmentation](https://github.com/google/mediapipe) (Apache 2.0)

Schriften (SIL Open Font License, über Fontsource): Dela Gothic One, DotGothic16, Press Start 2P
