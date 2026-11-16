# Implant Product Register — GitHub Pages + Firebase

This is the same app as the claude.ai version, set up to run on GitHub Pages. The data lives in **Google Firebase (Firestore)**, and people sign in with their Google account.

GitHub Pages only hosts the files. Firebase holds the data and decides who can see it. Both are free at this size.

## Part 1 — Create the database (Firebase, about 10 minutes)

1. **Create a project.** Go to https://console.firebase.google.com, click **Add project**, give it a name (e.g. `dhh-register`), and finish the steps (you can turn Google Analytics off).
2. **Create the database.** Under **Build → Firestore Database**, click **Create database**. Choose location **asia-south1 (Mumbai)**, then **Start in production mode**.
3. **Set who can use it.** In **Firestore Database → Rules**, delete what's there and paste the contents of `firestore.rules` from this folder. Replace `YOUR_EMAIL@gmail.com` with your Google email (add more emails for colleagues), then click **Publish**.
4. **Turn on Google sign-in.** Under **Build → Authentication → Get started → Sign-in method → Google**, switch it to Enable, choose a support email, and click **Save**.
5. **Register the web app.** Go to **Project settings** (gear icon) → **Your apps** → click the **</>** (Web) icon, give it a name, and click **Register app**. Copy the `firebaseConfig` values shown into `firebase-config.js` in this folder, replacing the placeholders.

## Part 2 — Put it on GitHub (about 5 minutes)

1. **Create the repository.** At https://github.com/new, name it (e.g. `dhh-register`). With a free GitHub account, Pages needs the repository to be **Public**. That's fine: the code and Firebase settings are not secret, and your data stays protected by the Firestore rules.
2. **Upload the files.** Click **uploading an existing file**, drag in **everything in this folder** (including `lib/` and `.nojekyll`), then click **Commit changes**.
   - Don't upload backup `.json` files or invoice Excel/PDF files to a public repository.
3. **Turn on Pages.** Go to **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, then **Save**. After a minute your site is at `https://YOUR-USERNAME.github.io/dhh-register/`.
4. **Allow sign-in from GitHub.** Back in Firebase, go to **Authentication → Settings → Authorized domains → Add domain** and add `YOUR-USERNAME.github.io`.

## Part 3 — Move your data across

1. In the **claude.ai** register, open **Export & connect → Download full backup**.
2. Open your GitHub site, sign in, go to **Export & connect → Restore from backup…** and choose that file.

Everything comes across: invoices, PIDs, counters, retired PIDs, sales documents, customers and company details. Restore only works into an empty register, so it can't overwrite anything.

After moving, use **one** copy (claude.ai or GitHub) for new work. They don't sync with each other.

## Files

| File | Purpose |
|---|---|
| `index.html`, `sales.js`, `parser.js` | The app (same code as claude.ai) |
| `firebase-config.js` | **Edit this:** your Firebase project settings |
| `firebase-adapter.js` | Connects the app to Firestore and Google sign-in |
| `firestore.rules` | **Edit and paste into Firebase:** who may read/write |
| `lib/` | PDF reader and PDF maker libraries |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Updating later

Edit a file on GitHub (pencil icon) or upload a new version. The site updates within a minute. Your data in Firebase is not affected.

## Connecting your own website

Your site can read the same Firestore database with the Firebase SDK (same project, same rules), or you can use **Download SQL (MySQL)** in the app as before.
