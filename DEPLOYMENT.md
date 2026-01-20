# Deployment Instructions for Rambis.net/puzzle

This guide will help you deploy the jigsaw puzzle application to your Ionos hosting.

## Deployment Package

**File:** `jigsaw-puzzle-deploy.zip` (11 KB)
**Contents:**
- index.html
- styles.css
- js/PuzzleCutter.js
- js/PuzzleEngine.js
- js/main.js

## Server Details

- **Host:** access-5019433264.webspace-host.com
- **Port:** 22
- **Protocol:** SFTP + SSH
- **Username:** a1407652
- **Password:** xucjox-dymvE0-soxbim
- **Target Directory:** `/puzzle` (to be created)

## Deployment Options

### Option 1: Using Ionos File Manager (Easiest)

1. Log in to your Ionos account at https://my.ionos.com
2. Navigate to **Websites & Domains**
3. Click on **File Manager** or **Webspace Explorer**
4. Navigate to your web root (usually `/` or `/httpdocs`)
5. Create a new folder called `puzzle`
6. Enter the `puzzle` folder
7. Upload the contents of `jigsaw-puzzle-deploy.zip` (extract locally first, then upload the files)
8. Ensure all files are uploaded:
   - index.html
   - styles.css
   - js/ folder with 3 JavaScript files

### Option 2: Using FileZilla (Recommended for SFTP)

1. **Download FileZilla Client** (if not installed): https://filezilla-project.org/
2. **Connect to your server:**
   - Host: `sftp://access-5019433264.webspace-host.com`
   - Username: `a1407652`
   - Password: `xucjox-dymvE0-soxbim`
   - Port: `22`
3. **Navigate to web root** (usually `/` or `/httpdocs`)
4. **Create `/puzzle` directory:**
   - Right-click in the remote panel → Create directory → Name it `puzzle`
5. **Upload files:**
   - Extract `jigsaw-puzzle-deploy.zip` on your local computer
   - Navigate into the `puzzle` directory on the server
   - Drag and drop all files from the extracted folder to the server
   - Make sure to upload the `js/` folder with all its contents

### Option 3: Using Command Line SFTP (Advanced)

From your local terminal with SFTP access:

```bash
# Connect to server
sftp -P 22 a1407652@access-5019433264.webspace-host.com

# Once connected, create puzzle directory
mkdir puzzle
cd puzzle

# Upload files (run from local directory containing the files)
put index.html
put styles.css
mkdir js
cd js
put PuzzleCutter.js
put PuzzleEngine.js
put main.js
```

### Option 4: Using WinSCP (Windows Users)

1. **Download WinSCP**: https://winscp.net/
2. **Create new connection:**
   - File protocol: SFTP
   - Host: `access-5019433264.webspace-host.com`
   - Port: `22`
   - Username: `a1407652`
   - Password: `xucjox-dymvE0-soxbim`
3. **Navigate to web root**
4. **Create `puzzle` folder**
5. **Upload all files** maintaining the directory structure

## File Structure on Server

After deployment, your server should have:

```
/puzzle/
├── index.html
├── styles.css
└── js/
    ├── PuzzleCutter.js
    ├── PuzzleEngine.js
    └── main.js
```

## Testing the Deployment

1. **Wait 5 minutes** (as noted in your Ionos account creation message)
2. Open your browser and navigate to: **https://rambis.net/puzzle/** or **http://rambis.net/puzzle/**
3. You should see the jigsaw puzzle application
4. Click "Start New Puzzle" to test functionality

## Expected Result

You should see:
- Control panel at the top with piece count and image selectors
- Large canvas area for the puzzle
- Instructions at the bottom
- Ability to start a puzzle and interact with pieces

## Troubleshooting

### If you see a 404 error:
- Check that the `/puzzle` directory exists in your web root
- Verify `index.html` is in the `/puzzle` directory
- Check file permissions (should be readable: 644 for files, 755 for directories)

### If you see a blank page:
- Open browser console (F12) and check for JavaScript errors
- Verify all three JS files are uploaded to `/js/` subdirectory
- Check that paths are correct (case-sensitive on Linux servers)

### If images don't load:
- This is expected! The app uses placeholder images from picsum.photos
- Images require internet connection to load
- Phase 5 will implement custom image uploads

### If touch controls don't work:
- Test on a touch device (tablet/phone)
- Check browser console for errors
- Ensure the page loaded completely

## File Permissions (if needed)

If files aren't accessible, set permissions via SFTP client or file manager:
- **Directories:** 755 (rwxr-xr-x)
- **Files:** 644 (rw-r--r--)

In FileZilla: Right-click file → File permissions → Set numeric value

## Next Steps After Deployment

Once deployed and tested:
1. **Phase 3:** Add PHP persistence (save/load puzzles)
2. **Phase 4:** Add multiplayer SSE sync (real-time 2-player)
3. **Phase 5:** Add image upload admin interface
4. **Phase 6:** Performance optimization for 1500 pieces

## Security Notes

- The application currently uses no authentication
- For Phase 3+ you'll want to add user authentication
- Consider adding .htaccess for access control
- Keep SFTP credentials secure

## Support

If you encounter issues:
1. Check browser console for JavaScript errors (F12)
2. Verify file structure matches the layout above
3. Check file permissions
4. Clear browser cache and reload
5. Test on different browsers

## Quick Reference URLs

After deployment, access at:
- **Primary:** https://rambis.net/puzzle/
- **Alternative:** http://rambis.net/puzzle/ (if HTTPS not configured)

The application is fully client-side JavaScript (Phases 1-2), so no PHP/server configuration is needed yet.
