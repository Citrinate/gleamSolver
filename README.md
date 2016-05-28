#Gleam.solver

Check out [Gleam.helper](https://github.com/Citrinate/gleamHelper) if you're looking for the convenience this script provides, but without any of the automation.

##Purpose
Automate entry into both types of Gleam.io Giveaways: Instant-wins and Raffles

**Disclaimer**: The usage of this script violates Gleam.io's Terms of Service.  Use at your own risk.

####Instant-win mode

The script will automatically complete the required social media activities, and then after you've received credit for doing so, it will automatically undo them.  For example, if you're required to join a certain Steam group, it will join that group, give you credit for it, and then leave the group. If you were already the member of that group, then the script give you credit for being a member, but it will not leave the group.

If the script doesn't auto-complete a certain entry type in this mode, then it's because the script doesn't have the ability to undo it, and so you'll have to complete it manually.

####Raffle mode

In the case of raffles, you may be disqualified for undoing any of the social media actions that the raffle asks of you. To prevent this, the script will only auto-complete the entries, it will not undo any of them. If the script doesn't auto-complete a certain entry type in this mode, then it's because it can't be auto-completed without the risk of disqualification, and so you'll have to complete it manually.

####Instant-win Plus mode

This is an alternative to Instant-win mode that isn't used by default, but can be selected using the script's UI.  This mode is something of a mix between the two other available modes.  It will auto-complete everything it has the ability to auto-complete, and then it will undo everything is has the ability to auto-undo.

You might use this mode if you would like the script to auto-undo the actions on accounts currently supported, but don't care about undoing anything on the accounts not currently supported.

The script **can** undo all actions on these accounts:
  * Steam
  * TwitchTV
  * Twitter

The script **cannot** undo any actions on these accounts:
  * E-mail
  * Eventbrite
  * Facebook
  * Instagram
  * Soundcloud
  * Tumblr
  * Youtube

##Installation
1. Install [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) (for Chrome) or [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) (for Firefox)
2. Go [here](https://raw.githubusercontent.com/Citrinate/gleamSolver/master/gleamSolver.user.js)
3. Click "Install"

By default, the script will auto-update roughly every 24 hours. You can force an update by re-installing using the link above.
