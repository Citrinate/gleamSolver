// ==UserScript==
// @name Gleam.solver
// @namespace https://github.com/Citrinate/gleamSolver
// @description Automates Gleam.io giveaways
// @author Citrinate
// @version 1.4.2
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
				"undo_some" // Instant-win Full mode: Mark all entries and remove all possible public record of social media activity on the user's accounts.
			];

		/**
		 * Choose a default mode based on the giveaway type
		 */
		function determineMode() {
			switch(gleam.campaign.campaign_type) {
				case "Reward": return GM_getValue("default_instant_mode", "undo_all"); // Instant-win
				case "Competition": return GM_getValue("default_raffle_mode", "undo_all"); // Raffle
				default: return "undo_all"; // Safest mode to fall back on
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
					authentications[current_authentication.provider] = !current_authentication.expired;
				}
			}
		}

		/**
		 * Decide what to do for each of the entries
		 */
		function handleEntries() {
			var entries = $(".entry-method"),
				delay = 0,
				num_entries = 0,
				current_entry = 0;

			// Jumble the order
			entries.sort(function() { return 0.5 - Math.random(); });
			num_entries_loading = 0;

			for(var i = 0; i < entries.length; i++) {
				var entry_element = entries[i],
					entry = unsafeWindow.angular.element(entry_element).scope();

				// Make sure that we can see and complete the entry
				if(gleam.canEnter(entry.entry_method) && // We can enter
					!entry.entry_method.entering &&  // We're not already entering
					(!gleam.campaign.details_first || gleam.contestantState.contestant.completed_details) && // We don't need to provide details before entering anything
					(!(entry.entry_method.auth_for_details || entry.entry_method.requires_details) || gleam.contestantState.contestant.completed_details) && // We've don't need to provide details before attempting this entry
					!entry.requiresMandatoryActions() && // The entry is visible
					(!entry.entry_method.requires_authentication || authentications[entry.entry_method.provider] === true) // The neccessary account is linked
				) {
					// Wait a random amount of time between each attempt, to appear more human
					delay += Math.floor(Math.random() * (entry_delay_max - entry_delay_min)) + entry_delay_min;
					num_entries++;

					gleamSolverUI.showNotification("entry_progress", "Processing entries...");

					(function(current_entry, entry, delay) {
						setTimeout(function() {
							// Check to see if the giveaway ended or if we've already gotten a reward
							if(!gleam.showPromotionEnded() && !(
									gleam.campaign.campaign_type == "Reward" &&
									gleam.contestantState.contestant.claims[gleam.incentives[0].id]
								)
							) {
								try {
									/* The following entries either leave no public record on the user's social media
									accounts, or they do, and the script is capable of then deleting those records. */
									switch(entry.entry_method.entry_type) {
										case "download_app":
										case "facebook_enter":
										case "facebook_visit":
										case "googleplus_visit":
										case "instagram_enter":
										case "steam_enter":
										case "steam_play_game":
										case "twitchtv_enter":
										case "twitchtv_subscribe":
										case "twitter_enter":
										case "youtube_subscribe":
											handleClickEntry(entry);
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
								gleamSolverUI.showNotification("entry_progress", current_entry + "/" + num_entries + " entries processed...");

								// Last entry
								if(current_entry == num_entries) {
									setTimeout(function() {
										gleamSolverUI.hideNotification("entry_progress");
									}, 500);

									// Wait until all the entries are finished before showing the UI again
									var temp_interval = setInterval(function() {
										if(gleam.entry_methods.filter(function(i) { return i.entering === true; }).length === 0) {
											clearInterval(temp_interval);
											gleamSolverUI.showUI();
										}
									}, 500);
								}
							} else {
								// Giveaway is over or completed
								gleamSolverUI.hideNotification("entry_progress");
								gleamSolverUI.showUI();
							}
						}, delay);
					})(++current_entry, entry, delay);
				}
			}

			// There were no entries that we could even attempt to auto-complete
			if(num_entries === 0) {
				gleamSolverUI.showNotification("nothing_to_do", "Couldn't auto-complete any entries");
				gleamSolverUI.showUI();
			}
		}

		/**
		 *
		 */
		function isEntriesLoading() {
			for(var i = 0; i < gleam.entry_methods.length; i++) {
				if(gleam.entry_methods[i].entering === true) {
					return true;
				}
			}

			return false;
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
		function markEntryCompleted(entry, callback) {
			markEntryNotLoading(entry);
			entry.enterLinkClick(entry.entry_method);
			entry.verifyEntryMethod();

			// Callback after gleam marks the entry as completed
			if(typeof(callback) == "function") {
				var temp_interval = setInterval(function() {
					if(!gleam.canEnter(entry.entry_method) || entry.entry_method.error) {
						clearInterval(temp_interval);
						callback(!gleam.canEnter(entry.entry_method));
					}
				}, 500);
			}
		}

		/**
		 * Trick gleam into thinking we've clicked a link
		 */
		function handleClickEntry(entry, trigger, callback) {
			markEntryLoading(entry);
			entry.triggerVisit(entry.entry_method.id);
			markEntryCompleted(entry, callback);
		}

		/**
		 * Trick gleam into thinking we've watched a video
		 */
		function handleVideoEntry(entry, callback) {
			markEntryLoading(entry);
			entry.entry_method.watched = true;
			entry.videoWatched(entry.entry_method);
			markEntryCompleted(entry, callback);
		}

		/**
		 * Share a random media item from the selection provided
		 */
		function handleMediaShare(entry, callback) {
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
					markEntryCompleted(entry, callback);
				}
			}, 500);
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
		function handleCustomAction(entry, callback) {
			if(entry.entry_method.template != "visit" && (
					entry.entry_method.method_type == "Ask a question" ||
					entry.entry_method.method_type == "Allow question or tracking" ||
					entry.entry_method.config5 ||
					entry.entry_method.config6
				)
			) {
				if(entry.entry_method.config5 !== null) {
					handleMultipleChoiceQuestionEntry(entry, callback);
				} else {
					handleQuestionEntry(entry, callback);
				}
			} else {
				handleClickEntry(entry, callback);
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
			} else if(entry.entry_method.template == "choose_option") {
				entry.entryState.formData[entry.entry_method.id] = rand_choice;
				entry.saveEntryDetails(entry.entry_method);
			} else if(entry.entry_method.template == "multiple_choice") {
				entry.entryState.formData[entry.entry_method.id][rand_choice] = true;
				entry.saveEntryDetails(entry.entry_method);
			} else {
				/* TODO: There's probably more templates that I'm missing here.
				I've seen one with a dropdown box before, but haven't seen it again since. */
			}

			markEntryCompleted(entry, callback);
		}

		/**
		 * Generate an answer for question entries
		 */
		function handleQuestionEntry(entry, callback) {
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
					markEntryCompleted(entry, callback);
				}
			}, 500);
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
						markEntryCompleted(entry);
						gleamSolverUI.showError('You must be logged into <a href="https://steamcommunity.com" style="color: #fff" target="_blank">steamcommunity.com</a>');
					} else if(active_groups === null) {
						// Couldn't get user's group data, try to mark it anyway incase we're already a member of the group.
						markEntryCompleted(entry);
						gleamSolverUI.showError("Unable to determine what Steam groups you're a member of.  Please make sure you're a member of at least 1 Steam group to use this script.");
					} else {
						if(active_groups.indexOf(group_name) != -1) {
							// User was already a member
							markEntryCompleted(entry);
						} else {
							joinSteamGroup(group_name, group_id, function() {
								markEntryCompleted(entry, function() {
									// Never leave a group that the user was already a member of
									if(active_groups.indexOf(group_name) == -1) {
										// Depending on mode, leave the group
										if(undoEntry()) {
											leaveSteamGroup(group_name, group_id);
										}
									}
								});
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
							if(typeof callback == "function") {
								callback();
							}
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
								callback();
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
							}, 500);
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
							auth_token = typeof auth_token == "undefined" ? null : auth_token;
							user_handle = typeof user_handle == "undefined" ? null : user_handle;
							ready = true;
						}
					});
				}

				/**
				 * Decide what to do for this entry
				 */
				function handleTwitterEntry(entry) {
					if(undoEntry() && (auth_token === null || user_handle === null)) {
						markEntryNotLoading(entry);
						gleamSolverUI.showError('You must be logged into <a href="https://twitter.com" style="color: #fff" target="_blank">twitter.com</a>');
					} else {
						switch(entry.entry_method.entry_type) {
							case "twitter_follow": handleTwitterFollowEntry(entry); break;
							case "twitter_retweet": handleTwitterTweetEntry(entry, true); break;
							case "twitter_tweet": handleTwitterTweetEntry(entry, false); break;
							default: break;
						}
					}
				}

				/**
				 * Complete the follow entry and then potentially undo it
				 */
				function handleTwitterFollowEntry(entry) {
					var twitter_handle = entry.entry_method.config1;

					// Determine if we're following this user before completing the entry
					getTwitterUserData(twitter_handle, function(twitter_id, already_following) {
						// Complete the entry
						handleClickEntry(entry, function(success) {
							// Depending on mode and if we were already following, unfollow the user
							if(success && undoEntry() && !already_following) {
								deleteTwitterFollow(twitter_handle, twitter_id);
							}
						});
					});
				}

				/**
				 * @return {String} twitter_id - Twitter id for this handle
				 * @return {Boolean} is_following - True for "following", false for "not following"
				 */
				function getTwitterUserData(twitter_handle, callback) {
					if(!undoEntry()) {
						// We're never going to need this information, so just return null
						callback(null, null);
					} else {
						GM_xmlhttpRequest({
							url: "https://twitter.com/" + twitter_handle,
							method: "GET",
							onload: function(response) {
								var twitter_id = $($(response.responseText).find("[data-screen-name='" + twitter_handle + "'][data-user-id]").get(0)).attr("data-user-id"),
									is_following = $($(response.responseText).find("[data-screen-name='" + twitter_handle + "'][data-you-follow]").get(0)).attr("data-you-follow");

								if(typeof twitter_id !== "undefined" && typeof is_following !== "undefined") {
									callback(twitter_id, is_following !== "false");
								} else {
									callback(null, null);
								}
							}
						});
					}
				}

				/**
				 * Unfollow a twitter user
				 */
				function deleteTwitterFollow(twitter_handle, twitter_id) {
					if(twitter_id === null) {
						gleamSolverUI.showError('Failed to unfollow Twitter user: <a href="https://twitter.com/' + twitter_handle + '" style="color: #fff" target="_blank">' + twitter_handle + '</a>');
					} else {
						GM_xmlhttpRequest({
							url: "https://twitter.com/i/user/unfollow",
							method: "POST",
							headers: { "Origin": "https://twitter.com", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
							data: $.param({ authenticity_token: auth_token, user_id: twitter_id }),
							onload: function(response) {
								if(response.status != 200) {
									gleamSolverUI.showError('Failed to unfollow Twitter user: <a href="https://twitter.com/' + twitter_handle + '" style="color: #fff" target="_blank">' + twitter_handle + '</a>');
								}
							}
						});
					}
				}

				/**
				 * Complete a tweet entry and then potentially undo it
				 * @param {Boolean} retweets - True if we're dealing with retweets, false for tweets
				 */
				function handleTwitterTweetEntry(entry, retweet) {
					var start_time = +new Date();

					markEntryCompleted(entry, function(success) {
						// Depending on mode, delete the tweet
						if(success && undoEntry()) {
							if(retweet) {
								deleteTwitterTweet(true, entry.entry_method.config1.match(/\/([0-9]+)/)[1]);
							} else {
								/* We don't have an id for the tweet, so instead delete the first tweet we can find
								that was posted after we handled the entry, but before it was marked completed.

								Tweets are instantly posted to our profile, but there's a delay before they're made
								public (a few seconds).  Increase the range by a few seconds to compensate. */
								getTwitterTweet(start_time, +new Date() + 60 * 1000, function(tweet_id) {
									if(tweet_id === false) {
										gleamSolverUI.showError('Failed to find <a href="https://twitter.com/' + user_handle + '" style="color: #fff" target="_blank">Tweet</a>');
									} else {
										deleteTwitterTweet(false, tweet_id);
									}
								});
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
							$($(response.responseText).find("a[href*='" + user_handle + "/status/']").get().reverse()).each(function() {
								var tweet_time = $(this).find("span").attr("data-time-ms"),
									tweet_id = $(this).attr("href").match(/\/([0-9]+)/);

								if(typeof tweet_time != "undefined" && tweet_id !== null) {
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
								gleamSolverUI.showError('Failed to delete <a href="https://twitter.com/' + user_handle + '" style="color: #fff" target="_blank">' + (retweet ? "Retweet" : "Tweet") + '</a>');
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
							}, 500);
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
								checkAuthentications();
								gleamSolverUI.loadUI();
							}
						}, 500);
					}
				}, 500);
			},

			/**
			 *
			 */
			completeEntries: function() {
				handleEntries();
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
					switch(gleam.campaign.campaign_type) {
						case "Reward": GM_setValue("default_instant_mode", mode); break;
						case "Competition": GM_setValue("default_raffle_mode", mode); break;
						default: break;
					}
				}
			},

			/**
			 * @return {Number} quantity - # of rewards being given away
			 */
			getQuantity: function() {
				return gleam.incentives[0].quantity;
			},

			/**
			 * @return {Boolean|Number} remaining - Estimated # of remaining rewards, false if not an instant-win giveaway
			 */
			getRemainingQuantity: function(callback) {
				if(gleam.campaign.campaign_type == "Reward") {
					/* Gleam doesn't report how many rewards have been distributed.  They only report how many entries have been
					completed, and how many entries are required for a reward.  Some users may only complete a few entries, not enough
					for them to get a reward, and so this is only an estimate, but we can say there's at least this many left. */
					var est_remaining = gleam.incentives[0].quantity - Math.floor(gleam.campaign.entry_count / gleam.incentives[0].actions_required);

					return Math.max(0, est_remaining);
				}

				return false;
			},

			/**
			 * @return {Number} chance - Estimated probability of winning a raffle rounded to 2 decimal places
			 */
			calcWinChance: function() {
				var your_entries = gleam.contestantEntries(),
					total_entries = gleam.campaign.entry_count,
					num_rewards = gleam.incentives[0].quantity;

				return Math.round(10000 * (1 - Math.pow((total_entries - your_entries) / total_entries, num_rewards))) / 100;
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
				".gs__main_container { font-size: 16.5px; left: 0px; position: fixed; top: 0px; width: 100%; z-index: 9999999999; }" +
				".gs__title { margin-right: 16px; vertical-align: middle; }" +
				".gs__select { margin: 0px 16px 0px 0px; width: 165px; }" +
				".gs__button { height: 22px; }" +
				".gs__notification { background: #000; border-top: 1px solid rgba(52, 152, 219, .5); box-shadow: 0px 2px 10px rgba(0, 0, 0, .5); box-sizing: border-box; color: #3498db; padding: 12px; width: 100%; }" +
				".gs__error { background: #e74c3c; border-top: 1px solid rgba(255, 255, 255, .5); box-shadow: 0px 2px 10px rgba(231, 76, 60, .5); box-sizing: border-box; color: #fff; padding: 12px; width: 100%; }" +
				".gs__quantity { font-style: italic; margin: 12px 0px 0px 0px; }" +
				".gs__win_chance { display: inline-block; font-size: 14px; line-height: 14px; position: relative; top: -4px; }"
			);

		/**`
		 * Push the page down to make room for notifications
		 */
		function updateTopMargin() {
			$("html").css("margin-top", (gleam_solver_container.is(":visible") ? gleam_solver_container.outerHeight() : 0));
		}

		/**
		 * Print details about how many rewards are up for grabs
		 */
		function showQuantity() {
			var num_rewards = gleamSolver.getQuantity(),
				num_remaining = gleamSolver.getRemainingQuantity(),
				msg = "(" + num_rewards.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + (num_rewards == 1 ? "reward" : "rewards") + " being given away" +
					(num_remaining === false ? "" : ";<br>~" + num_remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " remaining") + ")";

			$($(".incentive-description h3").get(0)).append($("<div>", { html: msg, class: "gs__quantity" }));
		}

		/**
		 * Print details about how likely you are to get an reward
		 */
		function updateWinChance() {
			win_chance_container.text("(~" + gleamSolver.calcWinChance() + "% to win)");
		}

		return {
			/**
			 * Print the UI
			 */
			loadUI: function() {
				var self = this;

				gleam_solver_main_ui =
					$("<div>", { class: "gs__notification" }).append(
					$("<span>", { class: "gs__title", text: "Gleam.solver v" + GM_info.script.version })).append(
					$("<select>", { class: "gs__select" }).append(
						$("<option>", { text: "Instant-win Mode", value: "undo_all", selected: (gleamSolver.getMode() == "undo_all") })).append(
						$("<option>", { text: "Raffle Mode", value: "undo_none", selected: (gleamSolver.getMode() == "undo_none") })).append(
						$("<option>", { text: "Instant-win Full Mode", value: "undo_some", selected: (gleamSolver.getMode() == "undo_some") })).change(function() {
							gleamSolver.setMode($(this).val());
						})).append(
					$("<a>", { text: "Auto-complete", class: "gs__button btn btn-embossed btn-info" }).click(function() {
						if(!disable_ui_click) {
							// Prevent double click
							disable_ui_click = true;

							self.hideNotification("nothing_to_do");
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
				$("html").css("overflow-y", "scroll");
				gleam_solver_container.append(gleam_solver_main_ui);
				setInterval(updateWinChance, 500);
				showQuantity();
				updateTopMargin();
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
					active_errors.push(msg);
					gleam_solver_container.append($("<div>", { class: "gs__error" }).html("Gleam.solver Error: " + msg));
					updateTopMargin();
				}
			},

			/**
			 * Display or update a notification
			 */
			showNotification: function(notification_id, msg) {
				if(!active_notifications[notification_id]) {
					// New notification
					active_notifications[notification_id] = $("<div>", { class: "gs__notification" });
					gleam_solver_container.append(active_notifications[notification_id]);
				}

				// Update notification
				active_notifications[notification_id].html("Gleam.solver Notification: " + msg);
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
			}
		};
	})();

	gleamSolver.initGleam();
})();