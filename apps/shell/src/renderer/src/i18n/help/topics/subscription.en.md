# Subscription connection

GenOffice runs its AI on a subscription you already have: a Claude subscription (Anthropic) or a ChatGPT plan (OpenAI). ChatGPT connects directly in GenOffice; if you already use OpenAI's Codex program on this PC, you can connect through Codex instead. You do not need an API key, and GenOffice has no account of its own to sign up for.

## How it works

- The AI is not built into GenOffice. Claude goes through the **Claude Code** program installed on this PC: GenOffice asks that program for the answer, and the program is signed in with your own account, so every request counts against your own plan.
- ChatGPT is connected by GenOffice itself, with no program. Sign in on OpenAI's ChatGPT sign-in page that opens in your browser, and allow this app to use your ChatGPT plan. Requests go from this PC straight to OpenAI, and the use comes out of that ChatGPT plan.
- **Codex** is OpenAI's program. When ChatGPT is connected through Codex, GenOffice asks the Codex program for the answer, the same way as with Claude Code.
- GenOffice has no sign-in form of its own inside the app. You sign in in the company's own program, or on the company's web page that opens in your browser. GenOffice never reads or stores the Claude Code or Codex login. The one sign-in GenOffice keeps is the one OpenAI gives this app when you connect ChatGPT directly, and it stays on this PC (encrypted on Windows). GenOffice never sees your ChatGPT password.

## Before you start

You need one of these. Having both is fine.

- A Claude subscription (a Pro or Max plan; a free Claude account cannot connect), and the Claude Code program installed and signed in on this PC.
- A ChatGPT plan. Connected directly, there is no program to install. The free plan allows only a little use. If you already use the Codex program on this PC, you can connect through Codex instead.

If Claude Code or Codex is not installed yet, or not signed in yet, the buttons in the next section take care of it.

## Connecting

1. Open **Settings** from the row at the bottom left of Home and choose **AI**. Under **Subscription connection** there are cards for Claude, ChatGPT and Codex, in that order. With a ChatGPT plan, connect on the ChatGPT card. The Codex card is for people who use the Codex program on this PC.
2. Read what the card says and press its button. The table below explains each state.
3. Come back to the GenOffice window. The card checks again by itself, and **Check again** checks at once.

The second step of the welcome screens on first launch, and the AI panel when no AI is connected, first ask "Which AI do you already use?" Pick a paid Claude subscription, ChatGPT, or neither yet, and you see only that path's steps and its one card. For Claude the steps are install the program → sign in → connected; for ChatGPT, sign in → connected. Under the ChatGPT path, **Already use the Codex program on this PC? Connect with Codex** switches to the Codex path (install the program → sign in → connected), and **Connect directly in the app, without Codex** on that path brings you back to the direct connection. If Codex is already connected, the Codex path is shown from the start. **Choose another way** lets you pick again, and you can skip it all and connect later. If it still does not connect, press **Copy details for help** and send what it copies to whoever is helping you. It contains no account and no file paths.

| What the card says                         | What it means                                                                                                     | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checking…**                              | GenOffice is asking the program how it stands.                                                                    | Wait a moment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Not installed**                          | The program was not found on this PC.                                                                             | Press **Install**. The company's official install command runs in a new terminal window, so you can watch what it does. GenOffice downloads nothing by itself. To install by hand instead, **Official install guide** opens the company's instructions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Not signed in**                          | The program is there but has no login.                                                                            | Press **Sign in**. The company's sign-in page opens in your browser: sign in there and allow access, and the card connects by itself. Take your time; signing in may take a while. If no browser opens at all, press **Browser did not open?** on the card (after 25 seconds it becomes an **Open the sign-in window** button). Do not press it while you are still signing in in the browser: it stops that sign-in and starts over. The sign-in window that opens lists what to do at the top. To paste a code into it, right-click inside the window, then press Enter. It is normal that the pasted code does not appear; if it says "Invalid code", paste the code into the same window again. To stop signing in, press **Cancel sign-in**. |
| **Connected**                              | A subscription login was confirmed. The plan name is shown when the program reports it.                           | Nothing. AI is ready to use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Signed in, but not with a subscription** | The program is signed in with an API key or a pay-as-you-go account, or the kind of login could not be confirmed. | See "Pay-as-you-go logins" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **The connection could not be checked**    | The check itself failed. The reason is shown on the card.                                                         | Press **Check again**. If it says the program is too old, press **Update**: the company's official update runs in a new window. When it has finished there, come back to GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Off in this app**                        | You turned the program off for this app in Settings. The app neither checks it nor sends it anything.             | Press **Use again**. The app checks the program again and uses it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The ChatGPT card goes through no program, so it never says **Not installed** or **Signed in, but not with a subscription**. When it says **Not signed in**, press **Continue with ChatGPT**: OpenAI's ChatGPT sign-in page opens in your browser. Sign in and allow this app to use your ChatGPT plan, and the card turns to **Connected** by itself. If you did not allow it, or it did not finish within 10 minutes, the card says the sign-in did not finish; pressing the button again starts over. There is no sign-in window and no code to paste. While you are signing in, **Cancel sign-in** stops it.

The connection is checked when the app starts, when you open Settings, and when you return to the window after starting an install or a sign-in.

If the Claude or Codex card says a sign-in did not finish, choose **Open the sign-in window**. A code the browser shows has to be pasted into that window; a code shown earlier no longer works.

If the browser page or the sign-in window shows `3p_delegated_access_policy_denied`, a policy on the Claude account may have blocked this sign-in. If trying again gives the same result, ask whoever manages the account, or check whether another account works.

## Without a subscription: free AI

No Claude or ChatGPT subscription? Under Settings ▸ AI, **Use for free** connects a free AI instead. Choosing **Neither yet** in the second step of the welcome screens shows the same cards, and choosing it in the AI panel when nothing is connected offers **Connect a free AI**.

- **OpenRouter**: press **Connect in browser**. Your browser opens OpenRouter; sign up or sign in, and allow access. When the browser says it is connected, close the tab and come back. There is no key to copy, and the card shows how many free requests are left today.
- **Google Gemini**: press **Get a key**, make a key in Google AI Studio, paste it into the card and press **Connect**. Only for people aged 18 or older. A key made in a Google project with billing turned on can be charged.
- Once connected, that AI becomes the **AI to use**. With both connected, **Use this AI** on a card switches between them. **Disconnect** removes the key from GenOffice.
- Free models are weaker than subscription models, and each day allows a limited number of requests. One edit of a document can take several. When today's allowance is used up, the AI panel says so, and when it can be used again.
- While you use it for free, what you send may be used to improve that company's AI. Take care with documents that hold personal information.

## Pay-as-you-go logins

A card that says **Signed in, but not with a subscription** carries a warning: "This is not a subscription: you are charged for what you use."

- GenOffice does not use that login until you press **Use anyway**. From then on, every request is billed to that account.
- Even then it is never chosen automatically. Choose it yourself under **AI to use**, where it is marked **Paid**.
- Your permission is remembered for that program only. It is cleared when the program is signed out or its login changes.
- To use your subscription instead, sign the program in with your subscription account and press **Check again**.

## Changing the account or signing out

A signed-in card shows the account it is signed in with. The Claude and Codex cards also show the plan name when the program reports it. Two more buttons appear as well.

- **Sign in with another account** starts the program's own sign-in again. Finish it in the window that opens, with the other account.
- **Sign out** runs the program's own sign-out. The card then says **Not signed in**.
- On the Claude and Codex cards, both apply to that program on this whole PC, not only to GenOffice. If you also use Claude Code or Codex in a terminal, it is signed out there too, or moved to the other account. GenOffice asks you to confirm first.
- The Claude and Codex cards also have **Don't use in this app**. It leaves the program and its sign-in as they are and stops only GenOffice from using it: no status checks, no requests, and **Automatic** passes over it. A terminal that uses the program is not affected. The card then says **Off in this app**, and **Use again** turns it back on. Neither asks you to confirm, because nothing outside GenOffice changes.
- The ChatGPT card is different. **Sign out** asks you to confirm with "This disconnects ChatGPT from this app"; once you confirm, GenOffice asks OpenAI to end this app's connection and deletes the sign-in it kept on this PC. **Sign in with another account** opens the sign-in page in your browser right away, without asking. Neither affects other programs on this PC, Codex included.
- A connected ChatGPT card says "AI in this app runs on your ChatGPT plan" and has a **Manage usage** link. It opens the usage page of your ChatGPT settings, where you can see how much this app uses and set a limit for this app alone.
- The account and these two buttons appear only here, under Settings ▸ AI. GenOffice shows the account and does not save it anywhere.

## Which AI is used

**AI to use**, under Settings ▸ AI, starts on **Automatic**. Automatic decides in this order:

1. Claude, when its card says Connected.
2. Otherwise ChatGPT, when its card says Connected.
3. Otherwise Codex, when its card says Connected.
4. Otherwise no AI is connected, and the AI panel shows the connect guide instead of an error.

Automatic never picks anything that costs extra money: not an API key, and not a pay-as-you-go login. Those are used only while you choose them yourself.

You can also choose one AI yourself, in the same place or in the model list at the bottom of the AI panel. If the one you chose stops working, GenOffice does not quietly move to another. It tells you what happened and shows how to reconnect.

The model list shows the models the program itself reports (for ChatGPT, the models OpenAI says your plan can use; the first of them is used until you choose one): each by its name, with its exact model ID beside it, and **Default model** with the model it currently stands for. The chip at the bottom of the AI panel and **AI to use** name that model too. Reading the list asks the AI nothing, so it does not count against your plan. If the program is too old to report its models, a short built-in list is shown instead.

Wherever Codex can be chosen, one line is shown with it: "Using a Codex subscription inside an app is not a method officially recommended by OpenAI." Decide with that in mind.

## When a request is stopped

A request stops when the plan's limit is used up, when the login has expired, or when the program is no longer there. GenOffice does not switch to another AI by itself.

- The reason is shown where the reply stopped. For a used-up limit, the time it resets is shown too, when the program reports it.
- ChatGPT connected directly stops when your plan's limit is used up, or the limit you set for this app in your ChatGPT settings. No reset time is shown. If you disconnected this app in your ChatGPT settings, the card turns to **Not signed in**; sign in again.
- If your other subscription is connected, a **Continue with …** button appears, for example **Continue with ChatGPT** or **Continue with Codex**. Pressing it makes that one the AI to use — the model list shows the change — and runs the request again.
- If the only other connection is a pay-as-you-go login you allowed, the same button comes with a note about the cost.
- There is never a button that moves you to an API key.

## The usage line

Once you have used 80% or more of a limit, the AI panel shows a line such as "85% used · resets at 3:00 PM". Claude reports a 5-hour limit and a 7-day limit, and Codex is shown the same way when it reports them. Below 80%, or when the program reports nothing, no line is shown. ChatGPT connected directly shows no such line; see what it has used through **Manage usage** on the ChatGPT card.

## What is sent, and where

The first time a subscription can be used, GenOffice shows a notice once. To read it again, go to Settings ▸ AI ▸ **First-connection notice** and press **View again**. It says three things:

- Document content and your conversation are sent to Anthropic or OpenAI under your own account.
- Whether that content is used to train AI is decided by your own account settings at that company, not by GenOffice.
- GenOffice turns off conversation history saving in Codex, but Codex may still keep its own diagnostic logs on this PC.

Requests through ChatGPT connected directly do not go through the Codex program; they go from this PC straight to OpenAI.

Anything you hid with **Hide the selection from AI** is not sent, whichever AI you use.

## Good to know

- **Speed.** A reply through Claude Code or Codex starts a few seconds later than one through an API key, because the program has to start up first. ChatGPT connected directly starts no program.
- **Free ChatGPT plan.** It shows as Connected, but its limits are small, so requests stop sooner. The usage line does not appear for it.
- **Image generation.** In this version a subscription does not generate images, on any plan. That needs an image provider key; see [AI models and settings](help://ai-models).
- **Proxies.** Claude Code and Codex do not take proxy settings from GenOffice. They use the proxy set for this PC, for example the `HTTPS_PROXY` environment variable, just as when you run them in a terminal. If they cannot connect in a terminal, they cannot connect from here either.
- **Commands and other programs.** A request that arrives from the `ieumoffice` command or from a connected coding agent does not use your subscription unless you allow it. Even then it uses Claude Code or Codex, never ChatGPT connected directly. See [Connecting a coding agent](help://mcp).
- **Agent mode.** [Agent mode](help://agent-mode) runs Claude Code or Codex on this PC. ChatGPT connected directly cannot run the agent.
