// ==UserScript==
// @name Gleam.solver
// @namespace https://github.com/Citrinate/gleamSolver
// @description Automates Gleam.io giveaways
// @author Citrinate
// @version 1.4.23
// @match http://gleam.io/*
// @match https://gleam.io/*
// @connect steamcommunity.com
// @connect twitter.com
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_addStyle
// @grant GM_xmlhttpRequest
// @grant unsafeWindow
// @updateURL https://raw.githubusercontent.com/Citrinate/gleamSolver/master/gleamSolver.user.js
// @downloadURL https://raw.githubusercontent.com/Citrinate/gleamSolver/master/gleamSolver.user.js
// @require https://raw.githubusercontent.com/Citrinate/gleamSolver/master/lib/randexp.min.js
// @require https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @run-at document-end
// ==/UserScript==

(function() {
	/**
	 *
	 */
	var gleamSolver = (function() {
		var gleam = null,
			script_mode = null,
			authentications = {},
			entry_delay_min = 500,
			entry_delay_max = 3000,
			valid_modes = [
				"undo_all", // Instant-win mode: There should be no public record of any social media activity on the user's accounts.
				"undo_none", // Raffle mode: All public record of social media activity should remain on the user's accounts.
				"undo_some" // Instant-win Plus mode: Mark all entries and remove all possible public record of social media activity on the user's accounts.
			];

		/**
		 * Choose a default mode based on the giveaway type
		 */
		function determineMode() {
			if(gleam.isReward()) {
				// Instant-win mode
				return GM_getValue("default_instant_mode", "undo_all");
			} else {
				// Raffle mode
				return GM_getValue("default_raffle_mode", "undo_none");
			}
		}

		/**
		 * @return {Boolean} undo - True if we're meant to undo the entries, false otherwise
		 */
		function undoEntry() {
			return script_mode != "undo_none";
		}

		/**
		 * Check to see what accounts the user has linked to gleam
		 */
		function checkAuthentications() {
			if(gleam.contestantState.contestant.authentications) {
				var authentication_data = gleam.contestantState.contestant.authentications;

				for(var i = 0; i < authentication_data.length; i++) {
					var current_authentication = authentication_data[i];
					authentications[current_authentication.provider] = current_authentication;
				}
			}
		}

		/**
		 * Check to see if we've got a necessary account linked for an entry
		 * @return {Boolean} has_authentications - True for we have the authentications, false for otherwise
		 */
		function hasAuthentications(entry_method) {
			if(entry_method.requires_authentication) {
				// The entry requires an account linked
				if(authentications[entry_method.provider] && !authentications[entry_method.provider].expired) {
					// And that account is linked
					return true;
				}
			} else {
				return true;
			}

			return false;
		}

		/**
		 * Check to see if we've provided enough details for an entry
		 * @return {Boolean} has_enough_details - True for has provided enough details, false for otherwise
		 */
		function hasEnoughDetails(entry_method) {
			if(!gleam.isReward() ||
				entry_method.provider === "email" ||
				gleam.campaign.require_contact_info
			) {
				// Information is required
				if(gleam.contestantState.contestant.id &&
					gleam.contestantState.contestant.email &&
					gleam.contestantState.contestant.name &&
					(!gleam.campaign.additional_contestant_details || !!gleam.contestantState.contestant.completed_details)
				) {
					// And we've already provided it
					return true;
				}
			} else {
				return true;
			}

			return false;
		}

		/**
		 * Decide what to do for each of the entries
		 */
		function handleEntries(num_entries_previously_completed) {
			var entries = $(".entry-method"),
				delay = 0,
				num_entries = 0,
				current_entry = 0,
				num_skipped = 0,
				mandatory_entry = null,
				entry_delays = [];

			GM_setValue("script_in_progress", +new Date());
			entries.sort(function() { return 0.5 - Math.random(); }); // Jumble the order
			checkAuthentications();
			num_entries_previously_completed = typeof num_entries_previously_completed == "undefined" ? 0 : num_entries_previously_completed;

			for(var i = 0; i < entries.length; i++) {
				var entry_element = entries[i],
					entry = unsafeWindow.angular.element(entry_element).scope();

				// Make sure that we can see and complete the entry
				if(gleam.canEnter(entry.entry_method) && // We can enter
					!entry.entry_method.entering &&  // We're not already entering
					hasEnoughDetails(entry.entry_method) && // We don't need to provide any details
					hasAuthentications(entry.entry_method) && // The neccessary account is linked
					gleam.isRunning() && // The giveaway is still going on
					!(gleam.isReward() && !!gleam.contestantState.contestant.claims[gleam.incentives[0].id]) && // We haven't recieved a reward
					!(!gleam.demandingAuth() && gleam.demandingChallenge()) // We don't have a captcha to solve
				) {
					// Wait a random amount of time between each attempt, to appear more human
					delay += Math.floor(Math.random() * (entry_delay_max - entry_delay_min)) + entry_delay_min;
					num_entries++;

					if(num_entries_previously_completed === 0) {
						gleamSolverUI.showNotification("entry_progress", "Processing entries...");
					}

					(function(current_entry, entry, delay) {
						entry_delays.push(setTimeout(function() {
							GM_setValue("script_in_progress", +new Date());

							// Check to see if the giveaway ended or if we've already gotten a reward
							if(gleam.isRunning() &&
								!(gleam.isReward() && gleam.contestantState.contestant.claims[gleam.incentives[0].id]) &&
								!(!gleam.demandingAuth() && gleam.demandingChallenge())
							) {
								try {
									/* The following entries either leave no public record on the user's social media
									accounts, or they do, and the script is capable of then deleting those records. */
									switch(entry.entry_method.entry_type) {
										case "download_app":
										case "facebook_visit":
										case "googleplus_visit":
										case "steam_play_game":
										case "twitchtv_subscribe":
										case "youtube_subscribe":
											handleClickEntry(entry);
											break;

										case "facebook_enter":
											handleSpecialClickEntry(entry);
											break;

										case "instagram_enter":
										case "steam_enter":
										case "twitchtv_enter":
										case "twitter_enter":
											handleFreeEntry(entry);
											break;

										case "steam_join_group":
											SteamHandler.getInstance().handleEntry(entry);
											break;

										case "twitter_follow":
										case "twitter_retweet":
										case "twitter_tweet":
											TwitterHandler.getInstance().handleEntry(entry);
											break;

										case "vimeo_watch":
										case "youtube_watch":
											handleVideoEntry(entry);
											break;

										default:
											break;
									}

									/* For the following entries it's not possible to automate without potentially
									being disqualified in a gleam raffle.  Only handle these if the user doesn't care
									about the status of the entry after this script completes. Such as in the case of
									Gleam instant-win giveaways. */
									if(script_mode != "undo_none") {
										switch(entry.entry_method.entry_type) {
											case "custom_action":
												handleCustomAction(entry);
												break;

											case "twitter_hashtags":
											case "pinterest_board":
											case "pinterest_follow":
											case "pinterest_pin":
											case "snapchat_snapcode":
											case "youtube_comment":
											case "youtube_video":
												handleQuestionEntry(entry);
												break;

											case "upload_action":
												handleUploadEntry(entry);
												break;

											default:
												break;
										}
									}

									/* The following entry types cannot presently be undone, and so only automate
									them if the user doesn't want social media actions to be undone.  Such as in the
									case of Gleam raffles. */
									if(script_mode != "undo_all") {
										switch(entry.entry_method.entry_type) {
											case "email_subscribe":
											case "eventbrite_attend_event":
											case "eventbrite_attend_venue":
											case "instagram_follow":
											case "instagram_like":
											case "soundcloud_follow":
											case "soundcloud_like":
											case "tumblr_follow":
											case "tumblr_like":
											case "tumblr_reblog":
											case "tumblr_reblog_campaign":
											case "twitchtv_follow":
												handleClickEntry(entry);
												break;

											case "facebook_media":
											case "instagram_choose":
											case "twitter_media":
												handleMediaShare(entry);
												break;

											default:
												break;
										}
									}
								}
								catch(e) {
									console.log(e);
								}

								// Display progress
								gleamSolverUI.showNotification("entry_progress", (current_entry + num_entries_previously_completed) +
									"/" + (num_entries + num_entries_previously_completed) + " entries processed...");

								// Last entry has been processed
								if(current_entry == num_entries) {
									// Wait for everything to finish loading
									var temp_interval = setInterval(function() {
										for(var j = 0; j < gleam.entry_methods.length; j++) {
											if(gleam.entry_methods[j].entering === true) {
												return;
											}
										}

										clearInterval(temp_interval);

										if(mandatory_entry !== null && !mandatory_entry.requiresMandatoryActions() && num_entries_previously_completed === 0) {
											// We've completed enough entries to unlock more, loop through again to complete them
											GM_setValue("script_in_progress", +new Date());
											handleEntries(num_entries);
										} else {
											gleamSolverUI.showUI();
											gleamSolverUI.hideNotification("entry_progress");
											GM_setValue("script_in_progress", false);

											// Let the user know that some of the entries were intentionally skipped
											if(num_skipped !== 0) {
												gleamSolverUI.showNotification("entries_skipped", "Some of the entries couldn't be completed and must be handled manually.");
											}
										}
									}, 100);
								}
							} else if(!gleam.demandingAuth() && gleam.demandingChallenge()) {
								for(i = 0; i < entry_delays.length; i++) {
									clearTimeout(entry_delays[i]);
								}

								GM_setValue("script_in_progress", false);
								gleamSolverUI.hideNotifications();
								gleamSolverUI.showNotification("captcha_popup", "Please solve the captcha before continuing.");
								gleamSolverUI.showUI();
							} else {
								// Giveaway is over or completed
								gleamSolverUI.hideNotification("entry_progress");
								gleamSolverUI.showUI();
							}
						}, delay));
					})(++current_entry, entry, delay);
				} else if(!gleam.isEntered(entry.entry_method)) {
					// The entry hasn't been completed previously and so it was skipped
					num_skipped++;

					// Keep track of an entry that can't be unlocked until others are completed
					if(mandatory_entry === null && entry.requiresMandatoryActions()) {
						mandatory_entry = entry;
					}
				}
			}

			if(!gleam.demandingAuth() && gleam.demandingChallenge()) {
				for(i = 0; i < entry_delays.length; i++) {
					clearTimeout(entry_delays[i]);
				}

				GM_setValue("script_in_progress", false);
				gleamSolverUI.hideNotifications();
				gleamSolverUI.showNotification("captcha_popup", "Please solve the captcha before continuing.");
				gleamSolverUI.showUI();
			} else if(gleam.campaign.starts_at > Math.floor(+new Date()/1000)) {
				// The giveaway hasn't started yet, schedule the script to run when it does
				GM_setValue("script_in_progress", false);

				var temp_interval = setInterval(function() {
					var current_time = Math.floor(+new Date()/1000),
						seconds_remaining = gleam.campaign.starts_at - current_time;

					if(!gleam.isRunning()) {
						gleamSolverUI.showNotification("countdown", "The promotion hasn't started yet.  The script will continue in " + seconds_remaining + "...");
					} else {
						clearInterval(temp_interval);
						gleamSolverUI.hideNotification("countdown");
						handleEntries();
					}
				}, 1000);
			} else if(num_entries === 0) {
				// There were no entries that we could even attempt to auto-complete
				gleamSolverUI.hideNotification("entry_progress");
				GM_setValue("script_in_progress", false);

				if(num_skipped !== 0 &&
					gleam.isRunning() &&
					!(gleam.isReward() && gleam.contestantState.contestant.claims[gleam.incentives[0].id])
				) {
					gleamSolverUI.showUI();
					gleamSolverUI.showNotification("nothing_to_do", "Couldn't complete any entries.  Please solve at least one manually, and then try again (reloading the page may also be necessary).");
				} else {
					gleamSolverUI.showNotification("nothing_to_do", "There's no entries left to complete.");
				}
			}
		}

		/**
		 * Provide visual feedback to the user that something is happening
		 */
		function markEntryLoading(entry) {
			entry.entry_method.entering = true;
		}

		/**
		 *
		 */
		function markEntryNotLoading(entry) {
			entry.entry_method.entering = false;
		}

		/**
		 * Finish up an entry
		 * @return {Boolean} success - True if the entry was completed, false if error
		 */
		function markEntryCompleted(entry, callback, max_wait) {
			if(callback === false) return;

			markEntryNotLoading(entry);
			entry.enterLinkClick(entry.entry_method); // Complete the entry
			entry.resumeEntry(entry.entry_method); // Shows a little pop-up letting the user know the entry is completed

			// Callback after gleam marks the entry as completed
			if(typeof(callback) == "function") {
				var max_time = typeof max_wait == "undefined" ? false : +new Date() + max_wait; // Max amount of time we should wait before callback

				var temp_interval = setInterval(function() {
					if(!gleam.canEnter(entry.entry_method) || entry.entry_method.error || (max_time && +new Date() > max_time)) {
						clearInterval(temp_interval);
						callback(!!gleam.isEntered(entry.entry_method));
					}
				}, 100);
			}
		}

		/**
		 * We don't need to do anything for this, just mark it completed
		 */
		function handleFreeEntry(entry, callback, max_wait) {
			markEntryLoading(entry);
			markEntryCompleted(entry, callback, max_wait);
		}

		/**
		 * Trick gleam into thinking we've clicked a link
		 */
		function handleClickEntry(entry, callback, max_wait) {
			markEntryLoading(entry);
			entry.triggerVisit(entry.entry_method.id);
			markEntryCompleted(entry, callback, max_wait);
		}

		/**
		 * Looks like a click entry, but calls saveEntryDetails instead of triggerVisit
		 */
		function handleSpecialClickEntry(entry, callback, max_wait) {
			markEntryLoading(entry);
			entry.saveEntryDetails(entry.entry_method);
			markEntryCompleted(entry, callback, max_wait);
		}

		/**
		 * Trick gleam into thinking we've watched a video
		 */
		function handleVideoEntry(entry, callback, max_wait) {
			markEntryLoading(entry);
			entry.entry_method.watched = true;
			entry.videoWatched(entry.entry_method);
			markEntryCompleted(entry, callback, max_wait);
		}

		/**
		 * Share a random media item from the selection provided
		 */
		function handleMediaShare(entry, callback, max_wait) {
			// Need to click the entry before entry_method.media can be defined...
			entry.enterLinkClick(entry.entry_method);
			markEntryLoading(entry);

			// ... and then wait for it to be defined
			var temp_interval = setInterval(function() {
				if(entry.entry_method.media) {
					var choices = entry.entry_method.media,
						rand_choice = choices[Math.floor(Math.random() * choices.length)];

					clearInterval(temp_interval);
					entry.entry_method.selected = rand_choice;
					entry.mediaChoiceContinue(entry.entry_method);
					markEntryCompleted(entry, callback, max_wait);
				}
			}, 100);
		}

		/**
		 * Upload a file
		 */
		function handleUploadEntry(entry, callback) {
			// TODO: Example at https://gleam.io/W4GAG/every-entry-type "Upload a Video of You Singing"
		}

		/**
		 * Custom actions can take on many different forms, decide what it is we're working with here
		 */
		function handleCustomAction(entry, callback, max_wait) {
			if(entry.entry_method.template != "visit" && (
					entry.entry_method.method_type == "Ask a question" ||
					entry.entry_method.method_type == "Allow question or tracking" ||
					entry.entry_method.config5 ||
					entry.entry_method.config6
				)
			) {
				if(entry.entry_method.config5 !== null) {
					// config5 contains a bunch of answers in CSV format
					handleMultipleChoiceQuestionEntry(entry, callback);
				} else {
					// config6 is used to verify a text entry
					handleQuestionEntry(entry, callback);
				}
			} else {
				// We're being asked to click a link, and a question may appear after we've done so
				if(entry.entry_method.config5 !== null) {
					handleClickEntry(entry, false);
					handleMultipleChoiceQuestionEntry(entry, callback);
				} else if(entry.entry_method.config6 !== null) {
					handleClickEntry(entry, false);
					handleQuestionEntry(entry, callback);
				} else {
					handleClickEntry(entry, callback);
				}
			}
		}

		/**
		 * Choose an answer to a multiple choice question
		 */
		function handleMultipleChoiceQuestionEntry(entry, callback) {
			var choices = entry.entry_method.config5.split("\n"),
				rand_choice = choices[Math.floor(Math.random() * choices.length)];

			markEntryLoading(entry);

			if(entry.entry_method.template == "choose_image") {
				entry.imageChoice(entry.entry_method, rand_choice);
				entry.imageChoiceContinue(entry.entry_method);
			} else if(entry.entry_method.template == "choose_option" || entry.entry_method.template == "visit") {
				entry.entryState.formData[entry.entry_method.id] = rand_choice;
				entry.saveEntryDetails(entry.entry_method);
			} else if(entry.entry_method.template == "multiple_choice") {
				entry.entryState.formData[entry.entry_method.id][rand_choice] = true;
				entry.saveEntryDetails(entry.entry_method);
			}

			markEntryCompleted(entry, callback, max_wait);
		}

		/**
		 * Generate an answer for question entries
		 */
		function handleQuestionEntry(entry, callback, max_wait) {
			var rand_string = null,
				string_regex = null;

			if(entry.entry_method.entry_type == "youtube_video") {
				// Asks for a youtube video link, and actually verifies that it's real.
				/* TODO: Grab a random Youtube link off Youtube and use that instead.
				Using a predefined link makes detection too easy. */
				rand_string = "https://www.youtube.com/watch?v=oHg5SJYRHA0";
				return;
			} else {
				if(entry.entry_method.entry_type == "twitter_hashtags") {
					// Gleam wants a link to a tweet here, but doesn't actually check the link.
					string_regex = "https://twitter\\.com/[a-z]{5,15}/status/[0-9]{1,18}";
				} else {
					if(entry.entry_method.config6 === "" || entry.entry_method.config6 === null) {
						// config6 is either "" or null to mean anything is accepted...
						string_regex = ".{5,15}";
					} else {
						// ... or a regex that the answer is checked against (validated both client and server-side)
						string_regex = entry.entry_method.config6;
					}
				}

				// Generate a random matching string
				var rand_string_generator = new RandExp(string_regex);
				rand_string_generator.tokens.stack[0].max = Math.floor(Math.random() * 3) + 1; // prevent long substrings
				rand_string = rand_string_generator.gen();
			}

			markEntryLoading(entry);
			// Submit the answer
			entry.entryState.formData[entry.entry_method.id] = rand_string;
			entry.verifiedValueChanged(entry.entry_method);

			// Wait until the answer is verified
			var temp_interval = setInterval(function() {
				if(entry.verifyStatus(entry.entry_method) == "good") {
					clearInterval(temp_interval);
					entry.saveEntryDetails(entry.entry_method);
					markEntryCompleted(entry, callback, max_wait);
				}
			}, 100);
		}

		/**
		 * Handles all Steam entries that may need to interact with Steam
		 */
		var SteamHandler = (function() {
			function init() {
				var steam_id = null,
					session_id = null,
					process_url = null,
					active_groups = [],
					ready = false;

				// Get all the user data we'll need to make join/leave group requests
				GM_xmlhttpRequest({
					url: "https://steamcommunity.com/my/groups",
					method: "GET",
					onload: function(response) {
						steam_id = response.responseText.match(/g_steamID = \"(.+?)\";/);
						session_id = response.responseText.match(/g_sessionID = \"(.+?)\";/);
						process_url = response.responseText.match(/processURL = '(.+?)';/);
						steam_id = steam_id === null ? null : steam_id[1];
						session_id = session_id === null ? null : session_id[1];
						process_url = process_url === null ? null : process_url[1];

						if(undoEntry()) {
							// Determine what groups the user is already a member of
							$(response.responseText).find("a[href^='https://steamcommunity.com/groups/']").each(function() {
								var group_name = $(this).attr("href").replace("https://steamcommunity.com/groups/", "").toLowerCase();

								if(group_name.indexOf("/") == -1) {
									active_groups.push(group_name);
								}
							});

							$.unique(active_groups);

							if(active_groups.length === 0) {
								/* Couldn't find any groups.  Either the user isn't in any, or there could be an issue with Steam.
								If we continue now, we may end up doing something the user doesn't want us to do.  So instead, we do nothing. */
								active_groups = null;
							}
						}
						ready = true;
					}
				});

				/**
				 *
				 */
				function handleSteamGroupEntry(entry, group_name, group_id) {
					if(steam_id === null || session_id === null || process_url === null) {
						// We're not logged in, try to mark it anyway incase we're already a member of the group.
						handleSpecialClickEntry(entry);
						gleamSolverUI.showError('You must be logged into <a href="https://steamcommunity.com" target="_blank">steamcommunity.com</a>. ' +
							'Please login to Steam Community and reload the page.');
					} else if(authentications.steam.uid != steam_id) {
						// We're not logged into the correct account, try to mark it anyway incase we're already a member of the group.
						markEntryNotLoading(entry);
						gleamSolverUI.showError('You must be logged into the Steam account that\'s linked to Gleam.io ' +
							'(<a href="https://steamcommunity.com/profiles/' + authentications.steam.uid + '/" target="_blank">' +
							'steamcommunity.com/profiles/' + authentications.steam.uid + '/</a>). Please login to the linked account and then reload the page.');
					} else if(active_groups === null) {
						// Couldn't get user's group data, try to mark it anyway incase we're already a member of the group.
						handleSpecialClickEntry(entry);
						gleamSolverUI.showError("Unable to determine what Steam groups you're a member of.  " +
							"Please make sure you're a member of at least 1 Steam group, and then reload the page.");
					} else {
						if(active_groups.indexOf(group_name) != -1) {
							// User was already a member
							handleSpecialClickEntry(entry);
						} else {
							joinSteamGroup(group_name, group_id, function(success) {
								var steam_community_down_error = "The Steam Community is experiencing issues. " +
									"Please handle any remaining Steam entries manually.<br>" +
									"If you're having trouble getting groups to appear on " +
									'<a href="https://steamcommunity.com/my/groups/">your groups list</a>, ' +
									'joining a <a href="https://steamcommunity.com/search/#filter=groups">new group</a> may force the list to update.';

								if(!success) {
									// Steam Community is having issues
									gleamSolverUI.showError(steam_community_down_error);
									gleamSolverUI.showError('Failed to join group: <a href="https://steamcommunity.com/groups/' + group_name + '">' + group_name + '</a>');
									// Sometimes when Steam Community is having issues, the join will be delayed
									// Try to complete the entry anyway
								}

								setTimeout(function() {
									handleSpecialClickEntry(entry, function() {
										// Depending on mode, leave the group, but never leave a group that the user was already a member of
										if(undoEntry() && active_groups.indexOf(group_name) == -1) {
											leaveSteamGroup(group_name, group_id, function(success) {
												if(!success) {
													// Steam Community is having issues
													gleamSolverUI.showError(steam_community_down_error);
													gleamSolverUI.showError('Failed to leave group: <a href="https://steamcommunity.com/groups/' + group_name + '">' + group_name + '</a>');
												}
											});
										}
									}, 10000);
								}, 1000);
							});
						}
					}
				}

				/**
				 * Join a steam group
				 */
				function joinSteamGroup(group_name, group_id, callback) {
					GM_xmlhttpRequest({
						url: "https://steamcommunity.com/groups/" + group_name,
						method: "POST",
						headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
						data: $.param({ action: "join", sessionID: session_id }),
						onload: function(response) {
							GM_xmlhttpRequest({
								url: "https://steamcommunity.com/my/groups",
								method: "GET",
								onload: function(response) {
									if(typeof callback == "function") {
										if($(response.responseText.toLowerCase()).find("a[href='https://steamcommunity.com/groups/" + group_name + "']").length === 0) {
											// Failed to join the group, Steam Community is probably down
											callback(false);
										} else {
											callback(true);
										}
									}
								}
							});
						}
					});
				}

				/**
				 * Leave a steam group
				 */
				function leaveSteamGroup(group_name, group_id, callback) {
					GM_xmlhttpRequest({
						url: process_url,
						method: "POST",
						headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
						data: $.param({ sessionID: session_id, action: "leaveGroup", groupId: group_id }),
						onload: function(response) {
							if(typeof callback == "function") {
								if($(response.responseText.toLowerCase()).find("a[href='https://steamcommunity.com/groups/" + group_name + "']").length !== 0) {
									// Failed to leave the group, Steam Community is probably down
									callback(false);
								} else {
									callback(true);
								}
							}
						}
					});
				}

				return {
					/**
					 *
					 */
					handleEntry: function(entry) {
						var group_name = entry.entry_method.config3.toLowerCase(),
							group_id = entry.entry_method.config4;

						markEntryLoading(entry);

						if(ready) {
							handleSteamGroupEntry(entry, group_name, group_id);
						} else {
							// Wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(ready) {
									clearInterval(temp_interval);
									handleSteamGroupEntry(entry, group_name, group_id);
								}
							}, 100);
						}
					}
				};
			}

			var instance;
			return {
				getInstance: function() {
					if(!instance) instance = init();
					return instance;
				}
			};
		})();

		/**
		 * Handles all Twitter entries that may need to interact with Twitter
		 */
		var TwitterHandler = (function() {
			function init() {
				var tweet_delay = 20 * 1000, // How long to wait for a tweet to appear
					auth_token = null,
					user_handle = null,
					user_id = null,
					deleted_tweets = [], // Used to make sure we dont try to delete the same (re)tweet more than once
					ready = false;

				// Get all the user data we'll need to undo twitter entries
				if(!undoEntry()) {
					ready = true;
				} else {
					GM_xmlhttpRequest({
						url: "https://twitter.com",
						method: "GET",
						onload: function(response) {
							auth_token = $($(response.responseText).find("input[id='authenticity_token']").get(0)).attr("value");
							user_handle = $(response.responseText).find(".account-group.js-mini-current-user").attr("data-screen-name");
							user_id = $(response.responseText).find(".account-group.js-mini-current-user").attr("data-user-id");
							auth_token = typeof auth_token == "undefined" ? null : auth_token;
							user_handle = typeof user_handle == "undefined" ? null : user_handle;
							user_id = typeof user_id == "undefined" ? null : user_id;
							ready = true;
						}
					});
				}

				/**
				 * Decide what to do for this entry
				 */
				function handleTwitterEntry(entry) {
					if(!authentications.twitter) {
						// The user doesn't have a Twitter account linked, but it's still sometimes possible to complete Twitter entries without one
						handleClickEntry(entry);
					} else {
						if(undoEntry() && (auth_token === null || user_handle === null || user_id === null)) {
							// We're not logged in
							markEntryNotLoading(entry);
							gleamSolverUI.showError('You must be logged into <a href="https://twitter.com" target="_blank">twitter.com</a>. ' +
								'Please login to Twitter and then reload the page.');
						} else if(undoEntry() && authentications.twitter.uid != user_id) {
							// We're not logged into the correct account
							markEntryNotLoading(entry);
							gleamSolverUI.showError('You must be logged into the Twitter account that\'s linked to Gleam.io ' +
								'(<a href="https://twitter.com/profiles/' + authentications.twitter.reference + '/" target="_blank">' +
								'twitter.com/' + authentications.twitter.reference + '</a>). Please login to the linked account and then reload the page.');
						} else {
							switch(entry.entry_method.entry_type) {
								case "twitter_follow": handleTwitterFollowEntry(entry); break;
								case "twitter_retweet": handleTwitterTweetEntry(entry, true); break;
								case "twitter_tweet": handleTwitterTweetEntry(entry, false); break;
								default: break;
							}
						}
					}
				}

				/**
				 * Complete the follow entry and then potentially undo it
				 */
				function handleTwitterFollowEntry(entry) {
					var twitter_handle = entry.entry_method.config1;

					if(!undoEntry()) {
						markEntryCompleted(entry);
					} else {
						// Determine if we're following this user before completing the entry
						getTwitterUserData(twitter_handle, function(twitter_id, already_following) {
							// Complete the entry
							markEntryCompleted(entry, function() {
								// Depending on mode and if we were already following, unfollow the user
								if(twitter_id === null) {
									gleamSolverUI.showError('Failed to unfollow Twitter user: ' +
										'<a href="https://twitter.com/' + twitter_handle + '" target="_blank">' + twitter_handle + '</a>');
								} else if(!already_following) {
									deleteTwitterFollow(twitter_handle, twitter_id);
								}
							}, 5000);
						});
					}
				}

				/**
				 * Complete a tweet entry and then potentially undo it
				 * @param {Boolean} retweets - True if we're dealing with retweets, false for tweets
				 */
				function handleTwitterTweetEntry(entry, retweet) {
					var start_time = +new Date();

					markEntryCompleted(entry, function() {
						// Depending on mode, delete the tweet
						if(undoEntry()) {
							if(retweet) {
								deleteTwitterTweet(true, entry.entry_method.config1.match(/\/([0-9]+)/)[1]);
							} else {
								/* We don't have an id for the tweet, so instead delete the first tweet we can find
								that was posted after we handled the entry, but before it was marked completed.

								Tweets are instantly posted to our profile, but there's a delay before they're made
								public (a few seconds).  Increase the range by a few seconds to compensate. */
								getTwitterTweet(start_time, +new Date() + 60 * 1000, function(tweet_id) {
									if(tweet_id === false) {
										gleamSolverUI.showError('Failed to find <a href="https://twitter.com/' + user_handle + '" target="_blank">Tweet</a>');
									} else {
										deleteTwitterTweet(false, tweet_id);
									}
								});
							}
						}
					}, 5000);
				}

				/**
				 * @return {String|Null} twitter_id - Twitter id for this handle, null on error
				 * @return {Boolean|Null} is_following - True for "following", false for "not following", null on error
				 */
				function getTwitterUserData(twitter_handle, callback) {
					GM_xmlhttpRequest({
						url: "https://twitter.com/" + twitter_handle,
						method: "GET",
						onload: function(response) {
							var twitter_id = $($(response.responseText.toLowerCase()).find("[data-screen-name='" + twitter_handle.toLowerCase() + "'][data-user-id]").get(0)).attr("data-user-id"),
								is_following = $($(response.responseText.toLowerCase()).find("[data-screen-name='" + twitter_handle.toLowerCase() + "'][data-you-follow]").get(0)).attr("data-you-follow");

							if(typeof twitter_id !== "undefined" && typeof is_following !== "undefined") {
								callback(twitter_id, is_following !== "false");
							} else {
								callback(null, null);
							}
						}
					});
				}

				/**
				 * Unfollow a twitter user
				 */
				function deleteTwitterFollow(twitter_handle, twitter_id) {
					GM_xmlhttpRequest({
						url: "https://twitter.com/i/user/unfollow",
						method: "POST",
						headers: { "Origin": "https://twitter.com", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
						data: $.param({ authenticity_token: auth_token, user_id: twitter_id }),
						onload: function(response) {
							if(response.status != 200) {
								gleamSolverUI.showError('Failed to unfollow Twitter user: ' +
									'<a href="https://twitter.com/' + twitter_handle + '" target="_blank">' + twitter_handle + '</a>');
							}
						}
					});
				}

				/**
				 * @param {Number} start_time - Unix timestamp in ms
				 * @param {Number} end_time - Unix timestamp in ms
				 * @return {Array|Boolean} tweet_id - The oldest (re)tweet id between start_time and end_time, false if none found
				 */
				function getTwitterTweet(start_time, end_time, callback) {
					GM_xmlhttpRequest({
						url: "https://twitter.com/" + user_handle,
						method: "GET",
						onload: function(response) {
							var found_tweet = false,
								now = +new Date();

							// reverse the order so that we're looking at oldest to newest
							$($(response.responseText.toLowerCase()).find("a[href*='" + user_handle.toLowerCase() + "/status/']").get().reverse()).each(function() {
								var tweet_time = $(this).find("span").attr("data-time-ms"),
									tweet_id = $(this).attr("href").match(/\/([0-9]+)/);

								if(typeof tweet_time !== "undefined" && tweet_id !== null) {
									if(deleted_tweets.indexOf(tweet_id[1]) == -1 && tweet_time > start_time && (tweet_time < end_time || tweet_time > now)) {
										// return the first match
										found_tweet = true;
										deleted_tweets.push(tweet_id[1]);
										callback(tweet_id[1]);
										return false;
									}
								}
							});

							// couldn't find any tweets between the two times
							if(!found_tweet) {
								callback(false);
							}
						}
					});
				}

				/**
				 * Delete tweet
				 * @param {Boolean} retweet - True if we're dealing with a retweet, false for a tweet
				 * @param {Array} tweet_id - A single  (re)tweet ID
				 */
				function deleteTwitterTweet(retweet, tweet_id) {
					GM_xmlhttpRequest({
						url: retweet ? "https://twitter.com/i/tweet/unretweet" : "https://twitter.com/i/tweet/destroy",
						method: "POST",
						headers: { "Origin": "https://twitter.com", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
						data: $.param({ _method: "DELETE", authenticity_token: auth_token, id: tweet_id }),
						onload: function(response) {
							if(response.status != 200) {
								gleamSolverUI.showError('Failed to delete <a href="https://twitter.com/' + user_handle + '" target="_blank">' + (retweet ? "Retweet" : "Tweet") + '</a>');
							}
						}
					});
				}

				return {
					/**
					 *
					 */
					handleEntry: function(entry) {
						markEntryLoading(entry);

						if(ready) {
							handleTwitterEntry(entry);
						} else {
							// Wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(ready) {
									clearInterval(temp_interval);
									handleTwitterEntry(entry);
								}
							}, 100);
						}
					}
				};
			}

			var instance;
			return {
				getInstance: function() {
					if(!instance) instance = init();
					return instance;
				}
			};
		})();

		return {
			/**
			 *
			 */
			initGleam: function() {
				// Wait for gleam to finish loading
				var temp_interval = setInterval(function() {
					if($(".popup-blocks-container") !== null) {
						clearInterval(temp_interval);
						gleam = unsafeWindow.angular.element($(".popup-blocks-container").get(0)).scope();

						// Wait for gleam to fully finish loading
						var another_temp_interval = setInterval(function() {
							if(typeof gleam.campaign.entry_count !== "undefined") {
								clearInterval(another_temp_interval);
								script_mode = determineMode();
								gleamSolverUI.loadUI();
							}
						}, 100);
					}
				}, 100);
			},

			/**
			 *
			 */
			completeEntries: function() {
				var in_progress = GM_getValue("script_in_progress", false);

				if(in_progress !== false && +new Date() - in_progress <= entry_delay_max) {
					// Prevent the script from running on multiple pages at the same time
					gleamSolverUI.showNotification("in_progress", "Gleam.solver is currently running on another page.  Please wait.");
					gleamSolverUI.showUI();
				} else {
					handleEntries();
				}
			},

			/**
			 *
			 */
			getMode: function() {
				return script_mode;
			},

			/**
			 *
			 */
			setMode: function(mode) {
				if(valid_modes.indexOf(mode) != -1) {
					script_mode = mode;

					// Save this mode as the default for this type of giveaway
					if(gleam.isReward()) {
						GM_setValue("default_instant_mode", mode);
					} else {
						GM_setValue("default_raffle_mode", mode);
					}
				}
			},

			/**
			 * @return {Number} quantity - # of rewards being given away
			 */
			getQuantity: function() {
				return !!gleam.incentives[0].quantity ? gleam.incentives[0].quantity : false;
			},

			/**
			 * @return {Boolean|Number} remaining - Estimated # of remaining rewards, false if not an instant-win giveaway
			 */
			getRemainingQuantity: function(callback) {
				if(gleam.isReward() && !!gleam.campaign.entry_count) {
					/* Gleam doesn't report how many rewards have been distributed.  They only report how many entries have been
					completed, and how many entries are required for a reward.  Some users may only complete a few entries, not enough
					for them to get a reward, and so this is only an estimate, but we can say there's at least this many left. */
					var est_remaining = gleam.incentives[0].quantity - Math.floor(gleam.campaign.entry_count / gleam.incentives[0].actions_required);

					return Math.max(0, est_remaining);
				}

				return false;
			},

			/**
			 * @return {Number} chance - Estimated probability of winning a raffle rounded to 2 decimal places, false if impossible to tell
			 */
			calcWinChance: function() {
				if(!!gleam.incentives[0].quantity) {
					var your_entries = gleam.contestantEntries(),
						total_entries = gleam.campaign.entry_count,
						num_rewards = gleam.incentives[0].quantity;

					if(gleam.campaign.entry_count !== 0) {
						return Math.round(10000 * (1 - Math.pow((total_entries - your_entries) / total_entries, num_rewards))) / 100;
					}
				}

				return false;
			}
		};
	})();

	/**
	 *
	 */
	var gleamSolverUI = (function() {
		var active_errors = [],
			active_notifications = {},
			disable_ui_click = false,
			win_chance_container = $("<span>", { class: "gs__win_chance" }),
			gleam_solver_container = $("<div>", { class: "gs__main_container" }),
			gleam_solver_main_ui = null;

			GM_addStyle(
				"html { overflow-y: scroll !important; }" +
				".gs__main_container { font-size: 16.5px; left: 0px; position: fixed; text-align: center; top: 0px; width: 100%; z-index: 9999999999; }" +
				".gs__title { margin-right: 16px; vertical-align: middle; }" +
				".gs__select { margin: 4px 16px 4px 0px; padding: 4px 2px; width: 150px; }" +
				".gs__button { margin: 4px 0px; height: 22px; }" +
				".gs__notification { background: #000; border-top: 1px solid rgba(52, 152, 219, .5); box-shadow: 0px 2px 10px rgba(0, 0, 0, .5); box-sizing: border-box; color: #3498db; line-height: 21px; padding: 12px; width: 100%; }" +
				".gs__error { background: #e74c3c; border-top: 1px solid rgba(255, 255, 255, .5); box-shadow: 0px 2px 10px rgba(231, 76, 60, .5); box-sizing: border-box; color: #fff; line-height: 21px; padding: 12px; width: 100%; }" +
				".gs__error a { color: #fff; }" +
				".gs__main_ui { padding-top: 4px; padding-bottom: 4px; }" +
				".gs__message { font-size: 14px; }" +
				".gs__quantity { font-style: italic; margin: 12px 0px 0px 0px; }" +
				".gs__win_chance { display: inline-block; font-size: 14px; line-height: 14px; position: relative; top: -4px; }" +
				".gs__close { float: right; background: rgba(255, 255, 255, .15); border: 1px solid #fff; box-shadow: 0px 0px 8px rgba(255, 255, 255, .5); cursor: pointer; margin-left: 4px; padding: 0px 4px; }" +
				".gs__close:hover { background: #fff; color: #e74c3c; }" +
				".gs__close::before { content: 'x'; position: relative; top: -1px; }"
			);

		/**
		 * Push the page down to make room for notifications
		 */
		function updateTopMargin() {
			$("html").css("margin-top", (gleam_solver_container.is(":visible") ? gleam_solver_container.outerHeight() : 0));
		}

		/**
		 * Print details about how many rewards are up for grabs
		 */
		function showQuantity() {
			var num_rewards = gleamSolver.getQuantity();

			if(!!num_rewards) {
				var	num_remaining = gleamSolver.getRemainingQuantity(),
					msg = "(" + num_rewards.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + (num_rewards == 1 ? "reward" : "rewards") + " being given away" +
						(num_remaining === false ? "" : ";<br>~" + num_remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " rewards remaining") + ")";

				$($(".incentive-description h3").get(0)).append($("<div>", { html: msg, class: "gs__quantity" }));
			}
		}

		/**
		 * Print details about how likely you are to get an reward
		 */
		function updateWinChance() {
			var win_chance = gleamSolver.calcWinChance();

			if(win_chance !== false) {
				win_chance_container.text("(~" + gleamSolver.calcWinChance() + "% to win)");
			}
		}

		return {
			/**
			 * Print the UI
			 */
			loadUI: function() {
				var self = this;

				gleam_solver_main_ui =
					$("<div>", { class: "gs__main_ui gs__notification" }).append(
					$("<span>", { class: "gs__title", text: "Gleam.solver v" + GM_info.script.version })).append(
					$("<select>", { class: "gs__select" }).append(
						$("<option>", { text: "Instant-win Mode", value: "undo_all", selected: (gleamSolver.getMode() == "undo_all") })).append(
						$("<option>", { text: "Raffle Mode", value: "undo_none", selected: (gleamSolver.getMode() == "undo_none") })).append(
						$("<option>", { text: "Instant-win Plus Mode", value: "undo_some", selected: (gleamSolver.getMode() == "undo_some") })).change(function() {
							gleamSolver.setMode($(this).val());
						})).append(
					$("<a>", { text: "Auto-complete", class: "gs__button btn btn-embossed btn-info" }).click(function() {
						if(!disable_ui_click) {
							// Prevent double click
							disable_ui_click = true;

							self.hideNotifications();
							$(this).parent().slideUp(400, function() {
								updateTopMargin();
								gleamSolver.completeEntries();
								disable_ui_click = false;
							});
						}
					})
				);

				$("body").append(gleam_solver_container);
				$("#current-entries .status.ng-binding").append(win_chance_container);
				gleam_solver_container.append(gleam_solver_main_ui);
				setInterval(updateWinChance, 500);
				showQuantity();
				updateTopMargin();

				// Show exact end date when hovering over any times
				$("[data-ends]").each(function() { $(this).attr("title", new Date(parseInt($(this).attr("data-ends")) * 1000)); });
			},

			/**
			 * Bring back the main UI
			 */
			showUI: function() {
				gleam_solver_main_ui.slideDown(400, function() {
					updateTopMargin();
				});
			},

			/**
			 * Print an error
			 */
			showError: function(msg) {
				// Don't print the same error multiple times
				if(active_errors.indexOf(msg) == -1) {
					var self = this;

					active_errors.push(msg);
					gleam_solver_container.append(
						$("<div>", { class: "gs__error gs__message" }).html("<strong>Error</strong>: " + msg).prepend(
							$("<div>", { class: "gs__close" }).click(function() {
								$(this).unbind("click");
								$(this).parent().slideUp(400, function() {
									active_errors.splice(active_errors.indexOf(msg), 1);
									$(this).remove();
									updateTopMargin();
								});
							})
						));
					updateTopMargin();
				}
			},

			/**
			 * Display or update a notification
			 */
			showNotification: function(notification_id, msg) {
				if(!active_notifications[notification_id]) {
					// New notification
					active_notifications[notification_id] = $("<div>", { class: "gs__notification gs__message" });
					gleam_solver_container.append(active_notifications[notification_id]);
				}

				// Update notification
				active_notifications[notification_id].html("<strong>Notification</strong>: " + msg);
				updateTopMargin();
			},

			/**
			 * Remove a notification
			 */
			hideNotification: function(notification_id) {
				if(active_notifications[notification_id]) {
					var old_notification = active_notifications[notification_id];

					delete active_notifications[notification_id];
					old_notification.slideUp(400, function() {
						old_notification.remove();
						updateTopMargin();
					});
				}
			},

			/**
			 * Remove all notifications
			 */
			hideNotifications: function() {
				for(var key in active_notifications) {
					this.hideNotification(key);
				}
			}
		};
	})();

	gleamSolver.initGleam();
})();