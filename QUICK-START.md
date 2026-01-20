# Quick Start - Deploy to Rambis.net/puzzle

## Fastest Method: Ionos File Manager

### Step-by-Step (5 minutes)

1. ✅ **Extract the ZIP file** on your computer
   - File: `jigsaw-puzzle-deploy.zip`
   - Extract to a folder on your desktop

2. ✅ **Log into Ionos**
   - Go to: https://my.ionos.com
   - Log in with your credentials

3. ✅ **Open File Manager**
   - Click "Websites & Domains"
   - Click "File Manager" or "Webspace Explorer"

4. ✅ **Create puzzle directory**
   - Navigate to your web root (usually `/` or `/httpdocs`)
   - Click "New Folder" or right-click → "Create directory"
   - Name it: `puzzle`

5. ✅ **Upload files**
   - Open the `puzzle` folder you just created
   - Click "Upload" button
   - Select all extracted files:
     - index.html
     - styles.css
     - js folder (with 3 .js files inside)
   - Wait for upload to complete

6. ✅ **Test it!**
   - Wait 1-2 minutes for changes to propagate
   - Open browser: **https://rambis.net/puzzle/**
   - You should see the jigsaw puzzle app!

## Alternative: FileZilla (If you prefer desktop app)

1. ✅ **Download FileZilla**: https://filezilla-project.org/
2. ✅ **Connect:**
   - Host: `sftp://access-5019433264.webspace-host.com`
   - Username: `a1407652`
   - Password: `xucjox-dymvE0-soxbim`
   - Port: `22`
3. ✅ **Create `/puzzle` folder** on server
4. ✅ **Drag & drop** extracted files into `/puzzle/`
5. ✅ **Test:** https://rambis.net/puzzle/

## Expected Result

You should see:
- ✅ Control panel with dropdown menus
- ✅ Large gray canvas area
- ✅ Instructions at bottom
- ✅ "Start New Puzzle" button works
- ✅ Touch controls work on mobile
- ✅ Mouse controls work on desktop

## Troubleshooting

**Can't see the site?**
- Wait 5 minutes (Ionos propagation time)
- Clear browser cache (Ctrl+F5)
- Try http://rambis.net/puzzle/ instead

**Blank screen?**
- Check that `js/` folder uploaded correctly
- Verify all 3 .js files are in the `js/` folder
- Check browser console (F12) for errors

**Need help?**
- See full guide: `DEPLOYMENT.md`
- Check file structure matches:
  ```
  /puzzle/
  ├── index.html
  ├── styles.css
  └── js/
      ├── PuzzleCutter.js
      ├── PuzzleEngine.js
      └── main.js
  ```

## That's it!

Once deployed, you're ready for:
- **Phase 3:** PHP persistence
- **Phase 4:** Multiplayer functionality
- **Phase 5:** Image uploads

Enjoy your puzzle! 🧩
