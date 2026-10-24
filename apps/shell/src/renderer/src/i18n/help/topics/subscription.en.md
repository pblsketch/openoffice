# Subscription connection

GenOffice runs its AI on a subscription you already have: a Claude subscription (Anthropic) or a Codex subscription (OpenAI). Codex is OpenAI's program, and you sign in to it with your ChatGPT plan. You do not need an API key, and GenOffice has no account of its own to sign up for.

## How it works

- The AI is not built into GenOffice. A program from the company is installed on this PC — **Claude Code** for a Claude subscription, **Codex** for a ChatGPT subscription — and GenOffice asks that program for the answer.
- That program is signed in with your own account, so every request counts against your own plan.
- GenOffice never shows a sign-in form of its own, and it never reads or stores your login. You sign in inside the company's own program and web page.

## Before you start

You need one of these. Having both is fine.

- A Claude subscription (a Pro or Max plan; a free Claude account cannot connect), and the Claude Code program installed and signed in on this PC.
- A ChatGPT subscription, and the Codex program installed and signed in on this PC.

If the program is not installed yet, or not signed in yet, the buttons in the next section take care of it.

## Connecting

1. Open **Settings** from the row at the bottom left of Home and choose **AI**. Under **Subscription connection** there is one card for Claude and one for Codex.
2. Read what the card says and press its button. The table below explains each state.
3. Come back to the GenOffice window. The card checks again by itself, and **Check again** checks at once.

The second step of the welcome screens on first launch, and the AI panel when no AI is connected, first ask "Which AI do you already use?" Pick a paid Claude subscription, ChatGPT, or neither yet, and you see only that path's steps (install the program → sign in → connected) and its one card. **Choose another way** lets you pick again, and you can skip it all and connect later. If it still does not connect, press **Copy details for help** and send what it copies to whoever is helping you. It contains no account and no file paths.

| What the card says                         | What it means                                                                                                     | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checking…**                              | GenOffice is asking the program how it stands.                                                                    | Wait a moment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Not installed**                          | The program was not found on this PC.                                                                             | Press **Install**. The company's official install command runs in a new terminal window, so you can watch what it does. GenOffice downloads nothing by itself. To install by hand instead, **Official install guide** opens the company's instructions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Not signed in**                          | The program is there but has no login.                                                                            | Press **Sign in**. The company's sign-in page opens in your browser: sign in there and allow access, and the card connects by itself. Take your time; signing in may take a while. If no browser opens at all, press **Browser did not open?** on the card (after 25 seconds it becomes an **Open the sign-in window** button). Do not press it while you are still signing in in the browser: it stops that sign-in and starts over. The sign-in window that opens lists what to do at the top. To paste a code into it, right-click inside the window, then press Enter. It is normal that the pasted code does not appear; if it says "Invalid code", paste the code into the same window again. To stop signing in, press **Cancel sign-in**. |
| **Connected**                              | A subscription login was confirmed. The plan name is shown when the program reports it.                           | Nothing. AI is ready to use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Signed in, but not with a subscription** | The program is signed in with an API key or a pay-as-you-go account, or the kind of login could not be confirmed. | See "Pay-as-you-go logins" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **The connection could not be checked**    | The check itself failed. The reason is shown on the card.                                                         | Press **Check again**. If it says the program is too old, press **Update**: the company's official update runs in a new window. When it has finished there, come back to GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The connection is checked when the app starts, when you open Settings, and when you return to the window after starting an install or a sign-in.

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

A card whose program is signed in shows the account it is signed in with, next to the plan name, when the program reports it. It also has two buttons.

- **Sign in with another account** starts the program's own sign-in again. Finish it in the window that opens, with the other account.
- **Sign out** runs the program's own sign-out. The card then says **Not signed in**.
- Both apply to that program on this whole PC, not only to GenOffice. If you also use Claude Code or Codex in a terminal, it is signed out there too, or moved to the other account. GenOffice asks you to confirm first.
- The account and these two buttons appear only here, under Settings ▸ AI. GenOffice shows the account and does not save it anywhere.

## Which AI is used

**AI to use**, under Settings ▸ AI, starts on **Automatic**. Automatic decides in this order:

1. Claude, when its card says Connected.
2. Otherwise Codex, when its card says Connected.
3. Otherwise no AI is connected, and the AI panel shows the connect guide instead of an error.

Automatic never picks anything that costs extra money: not an API key, and not a pay-as-you-go login. Those are used only while you choose them yourself.

You can also choose one AI yourself, in the same place or in the model list at the bottom of the AI panel. If the one you chose stops working, GenOffice does not quietly move to another. It tells you what happened and shows how to reconnect.

The model list shows the models the program itself reports: each by its name, with its exact model ID beside it, and **Default model** with the model it currently stands for. The chip at the bottom of the AI panel and **AI to use** name that model too. Reading the list asks the AI nothing, so it does not count against your plan. If the program is too old to report its models, a short built-in list is shown instead.

Wherever Codex can be chosen, one line is shown with it: "Using a Codex subscription inside an app is not a method officially recommended by OpenAI." Decide with that in mind.

## When a request is stopped

A request stops when the plan's limit is used up, when the login has expired, or when the program is no longer there. GenOffice does not switch to another AI by itself.

- The reason is shown where the reply stopped. For a used-up limit, the time it resets is shown too, when the program reports it.
- If your other subscription is connected, a **Continue with …** button appears, for example **Continue with Codex**. Pressing it makes that one the AI to use — the model list shows the change — and runs the request again.
- If the only other connection is a pay-as-you-go login you allowed, the same button comes with a note about the cost.
- There is never a button that moves you to an API key.

## The usage line

Once you have used 80% or more of a limit, the AI panel shows a line such as "85% used · resets at 3:00 PM". Claude reports a 5-hour limit and a 7-day limit, and Codex is shown the same way when it reports them. Below 80%, or when the program reports nothing, no line is shown.

## What is sent, and where

The first time a subscription can be used, GenOffice shows a notice once. To read it again, go to Settings ▸ AI ▸ **First-connection notice** and press **View again**. It says three things:

- Document content and your conversation are sent to Anthropic or OpenAI under your own account.
- Whether that content is used to train AI is decided by your own account settings at that company, not by GenOffice.
- GenOffice turns off conversation history saving in Codex, but Codex may still keep its own diagnostic logs on this PC.

Anything you hid with **Hide the selection from AI** is not sent, whichever AI you use.

## Good to know

- **Speed.** A reply through a subscription starts a few seconds later than one through an API key, because the company's program has to start up first.
- **Free ChatGPT plan.** It shows as Connected, but its limits are small, so requests stop sooner. The usage line does not appear for it.
- **Image generation.** In this version a subscription does not generate images, on any plan. That needs an image provider key; see [AI models and settings](help://ai-models).
- **Proxies.** Claude Code and Codex do not take proxy settings from GenOffice. They use the proxy set for this PC, for example the `HTTPS_PROXY` environment variable, just as when you run them in a terminal. If they cannot connect in a terminal, they cannot connect from here either.
- **Commands and other programs.** A request that arrives from the `ieumoffice` command or from a connected coding agent does not use your subscription unless you allow it. See [Connecting a coding agent](help://mcp).
