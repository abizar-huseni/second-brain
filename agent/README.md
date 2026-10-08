# Brain Link: your assistant's hands on your laptop

Your Second Brain suggests a fix ("your screen turns off after 2 minutes, set it to 15?"), you tap **Approve** in the app, and Brain Link does it on your laptop.

**What it can do:** screen timeout, sleep timeout, lock the laptop, open a link, show a reminder, check battery and disk space, find files by name, read a text document into your assistant's memory, and tidy a folder (with undo).

**What it can't do:** anything else. There is no "run any command". It only looks inside the folders you choose, it re-checks every job itself, and it only talks out to your dashboard (it opens nothing on your laptop to the internet).

## Set it up on Windows (10 minutes, once)

1. Install Node.js: go to **nodejs.org**, download the **LTS** version, run it, click Next until Finish.
2. Make a folder `C:\Users\<you>\BrainLink` and save [`brain-link.mjs`](brain-link.mjs) into it (open the file on GitHub → **Download raw file**).
3. Open the **Start menu**, type `cmd`, press Enter. In the black window type:
   ```
   cd %USERPROFILE%\BrainLink
   node brain-link.mjs setup
   ```
4. Answer the questions:
   - **Dashboard address:** press Enter.
   - **Sync token:** in your dashboard open **Me → Connections**, copy the sync token, paste it (you won't see it as you paste, that's on purpose). Never send this token to anyone, including in chat.
   - **Folders:** press Enter to share Documents and Downloads, or type your own, e.g. `C:\Users\you\Documents\Uni`.
5. Start it: `node brain-link.mjs`. Leave the window open. Your dashboard now shows your laptop as online.

**Start it automatically at login:** press `Win + R`, type `shell:startup`, press Enter. In that folder, right-click → New → Text Document, name it `brain-link.cmd` (yes, change the ending), right-click → Edit, paste:
```
@echo off
cd /d %USERPROFILE%\BrainLink
start "Brain Link" /min node brain-link.mjs
```
Save. It now starts minimised every time you log in.

## Mac

Install Node from nodejs.org, then in Terminal:
```
mkdir -p ~/BrainLink && cd ~/BrainLink
# put brain-link.mjs here
node brain-link.mjs setup
node brain-link.mjs
```
Changing screen or sleep timers asks for your Mac password in a normal macOS window.

## Good to know

- Settings live in `~/.brain-link/config.json` (only your user can read it). `node brain-link.mjs status` shows them without the token.
- An approval expires after 30 minutes if the laptop was off.
- Tidy always previews first. A real tidy writes an undo file, and "Undo tidy" puts everything back.
- Reading a document copies up to 20,000 characters of it to your dashboard so the assistant can remember it. Only share folders you're happy with.
- To stop it: close the window, or delete the `brain-link.cmd` startup file.
