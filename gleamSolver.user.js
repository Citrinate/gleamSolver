// ==UserScript==
// @name Gleam.solver
// @namespace https://github.com/Citrinate/gleamSolver
// @description Auto-completes Gleam.io contest entries
// @author Citrinate
// @version 1.3.8
// @match *://gleam.io/*
// @match https://steamcommunity.com/app/329630
// @updateURL https://raw.githubusercontent.com/Citrinate/gleamSolver/master/gleamSolver.user.js
// @downloadURL https://raw.githubusercontent.com/Citrinate/gleamSolver/master/gleamSolver.user.js
// @require https://raw.githubusercontent.com/Citrinate/gleamSolver/master/lib/randexp.min.js
// @run-at document-end
// ==/UserScript==

(function() {
	// command_hub_url is the only page on steamcommunity that this script will be injected at (as referenced in @match above)
	// it can be any page on steamcommunity.com that can be loaded into an iframe
	var command_hub_url = "https://steamcommunity.com/app/329630";
	// valid modes:
	// "undo_all" (Instant-win mode): There should be no public record of any social media activity on the user's accounts
	// "undo_none (Raffle mode): All public record of social media activity should remain on the user's accounts
	// "undo_some" (Instant-win Full mode): Mark all entries and remove all possible public record of social media activity on the user's accounts
	var valid_modes = ["undo_all", "undo_none", "undo_some"],
		current_version = "1.3.8",
		entry_delay_min = 500,
		entry_delay_max = 3000;

	var gleamSolver = (function() {
		var gleam = null,
			steam_handler = null,
			script_mode = null,
			authentications = {};

		// choose a mode based on the giveaway type
		function determineMode() {
			switch(gleam.campaign.campaign_type) {
				case "Reward": return "undo_all"; // Instant-win
				case "Competition": return "undo_none";	// Raffle
				default: return "undo_all"; // Safest mode to fall back on
			}
		}

		// check to see what accounts the user has linked to gleam
		function checkAuthentications() {
			if(gleam.contestantState.contestant.authentications) {
				var authentication_data = gleam.contestantState.contestant.authentications;

				for(var i = 0; i < authentication_data.length; i++) {
					var current_authentication = authentication_data[i];
					authentications[current_authentication.provider] = !current_authentication.expired;
				}
			}
		}

		// decide what to do for each of the entries
		function handleEntries() {
			var entries = jQuery(".entry-method"),
				delay = 0,
				num_entries = 0,
				current_entry = 0;
			
			// jumble the order
			entries.sort(function() { return 0.5 - Math.random(); });

			for(var i = 0; i < entries.length; i++) {
				var entry = angular.element(entries[i]).scope();
				
				// make sure that we can see and complete the entry
				if(gleam.canEnter(entry.entry_method) && 
					!entry.entry_method.entering && (
						entry.entry_method.mandatory ||
						gleam.entry_methods.length - gleam.nonMandatoryEntriesCount() <= gleam.contestantEntries()
					) && (
						!entry.entry_method.requires_authentication || 
						authentications[entry.entry_method.provider] === true
					)
				) {
					// wait a random amount of time between each attempt, to appear more human
					delay += Math.floor(Math.random() * (entry_delay_max - entry_delay_min)) + entry_delay_min;
					num_entries++;
					
					(function(current_entry, entry, delay) {
						setTimeout(function() {
							// check to see if the giveaway ended or if we've already gotten a reward
							if(!gleam.showPromotionEnded() && !(
									gleam.campaign.campaign_type == "Reward" &&
									gleam.contestantState.contestant.claims[gleam.incentives[0].id]
								)
							) {
								// display progress
								gleamSolverUI.showNotification("entry_progress", current_entry + "/" + num_entries + " entries processed");							
								if(current_entry == num_entries) {
									gleamSolverUI.hideNotification("entry_progress");
									gleamSolverUI.showUI();
								}
								
								try {
									// the following entries either leave no public record on the user's social media accounts, 
									// or they do, and the script is capable of then deleting those records
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

										case "youtube_watch":
										case "vimeo_watch":
											handleVideoEntry(entry);
											break;

										case "steam_join_group":
											handleSteamEntry(entry);
											break;

										default:
											break;
									}

									// for the following entries it's not possible to automate without potentially
									// being disqualified in a gleam raffle.  only handle these if the user doesn't care
									// about the status of the entry after this script completes: such as in the case of
									// gleam instant-win giveaways
									if(script_mode != "undo_none") {
										switch(entry.entry_method.entry_type) {
											case "pinterest_board":
											case "pinterest_follow":
											case "pinterest_pin":
											case "youtube_comment":
											case "youtube_video":
											case "twitter_hashtags":
												handleQuestionEntry(entry);
												break;

											case "custom_action":
												handleCustomAction(entry);
												break;

											case "upload_action":
												handleUploadEntry(entry);
												break;
												
											default:
												break;
										}
									}

									// the following entry types cannot presently be undone, and so only automate
									// them if the user doesn't want social media actions to be undone: such as in the 
									// case of gleam raffles
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
											case "twitter_follow":
											case "twitter_retweet":
											case "twitter_tweet":
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
							} else {
								if(gleam.showPromotionEnded()) {
									gleamSolverUI.showNotification("finished_early", "Stopped processing entries due to: Contest ended");
								} else {
									gleamSolverUI.showNotification("finished_early", "Stopped processing entries due to: Reward recieved");
								}
							}
						}, delay);
					})(++current_entry, entry, delay);
				}
			}
		}

		// provide visual feedback to the user that something is happening
		function markEntryLoading(entry) {
			entry.entry_method.entering = true;
		}
		
		// finish up an entry
		function markEntryCompleted(entry, callback) {
			entry.entry_method.entering = false;
			entry.enterLinkClick(entry.entry_method);
			entry.verifyEntryMethod();

			// callback after gleam marks the entry as completed
			if(typeof(callback) == "function") {
				var temp_interval = setInterval(function() {
					if(!gleam.canEnter(entry.entry_method) || entry.entry_method.error) {
						clearInterval(temp_interval);
						callback();
					}
				}, 500);
			}
		}

		// trick gleam into thinking we've clicked a link
		function handleClickEntry(entry) {
			markEntryLoading(entry);
			entry.triggerVisit(entry.entry_method.id);
			markEntryCompleted(entry);
		}

		// trick gleam into thinking we've watched a video
		function handleVideoEntry(entry) {
			markEntryLoading(entry);
			entry.entry_method.watched = true;
			entry.videoWatched(entry.entry_method);
			markEntryCompleted(entry);
		}

		// share a random media from the selection provided
		function handleMediaShare(entry) {
			// need to click the entry before entry_method.media is defined
			entry.enterLinkClick(entry.entry_method);
			markEntryLoading(entry);

			// and then wait
			var temp_interval = setInterval(function() {
				if(entry.entry_method.media) {
					var choices = entry.entry_method.media,
						rand_choice = choices[Math.floor(Math.random() * choices.length)];

					clearInterval(temp_interval);
					entry.entry_method.selected = rand_choice;
					entry.mediaChoiceContinue(entry.entry_method);
					markEntryCompleted(entry);
				}
			}, 500);
		}
		
		// upload a file
		function handleUploadEntry(entry) {
			//TODO: example at https://gleam.io/W4GAG/every-entry-type "Upload a Video of You Singing"
		}

		// custom actions can take on many different forms, 
		// decide what it is we're working with here
		function handleCustomAction(entry) {
			if(entry.entry_method.template != "visit" && (
					entry.entry_method.method_type == "Ask a question" ||
					entry.entry_method.method_type == "Allow question or tracking" ||
					entry.entry_method.config5 ||
					entry.entry_method.config6
				)
			) {
				if(entry.entry_method.config5 !== null) {
					handleMultipleChoiceQuestionEntry(entry);
				} else {
					handleQuestionEntry(entry);
				}
			} else {
				handleClickEntry(entry);
			}
		}

		// choose an answer to a multiple choice question
		function handleMultipleChoiceQuestionEntry(entry) {
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
				//TODO: there's probably more templates that I'm missing here.
				//      i've seen one with a dropdown box before, but haven't seen it again since
			}
			markEntryCompleted(entry);
		}

		// generate an answer for question entries
		function handleQuestionEntry(entry) {
			var rand_string = null,
				string_regex = null;

			if(entry.entry_method.entry_type == "youtube_video") {
				// asks for a youtube video link, and actually verifies that it's real
				
				//TODO: grab a random youtube link off youtube and use that instead,
				//      using a predefined link makes detection too easy
				rand_string = "https://www.youtube.com/watch?v=oHg5SJYRHA0";
				return;
			} else {
				if(entry.entry_method.entry_type == "twitter_hashtags") {
					// gleam wants a link to a tweet here, but doesn't actually check the link
					string_regex = "https://twitter\\.com/[a-z]{5,15}/status/[0-9]{1,18}";
				} else {
					if(entry.entry_method.config6 === "" || entry.entry_method.config6 === null) {
						// config6 is either "" or null to mean anything is accepted
						string_regex = "[a-z]{5,15}";
					} else {
						// or a regex that the answer is checked against (validated both client and server-side)
						string_regex = entry.entry_method.config6;
					}
				}

				// generate a random matching string
				var rand_string_generator = new RandExp(string_regex);
				rand_string_generator.tokens.stack[0].max = Math.floor(Math.random() * 3) + 1; // prevent long substrings
				rand_string = rand_string_generator.gen();
			}

			markEntryLoading(entry);
			// submit the answer
			entry.entryState.formData[entry.entry_method.id] = rand_string;
			entry.verifiedValueChanged(entry.entry_method);

			// wait until the answer is verified
			var temp_interval = setInterval(function() {
				if(entry.verifyStatus(entry.entry_method) == "good") {
					clearInterval(temp_interval);
					entry.saveEntryDetails(entry.entry_method);
					markEntryCompleted(entry);
				}
			}, 500);
		}

		// init steamHandler
		function handleSteamEntry(entry) {
			if(steam_handler === null) {
				steam_handler = loadSteamHandler.getInstance();
			}

			markEntryLoading(entry);
			steam_handler.handleEntry(entry);
		}

		// handles steam_join_group entries
		var loadSteamHandler = (function() {
			function init() {
				// Need some way to communicate with steamcommunity.com that is preferrably transparent
				// to the user.  command_hub is simply a page on steamcommunity.com that can be loaded
				// into an iframe.  We can communicate with the iframe from here and use it as our
				// interface to joining and leaving Steam groups.
				var command_hub = document.createElement('iframe'),
					command_hub_loaded = false;
				
				command_hub.style.display = "none";
				command_hub.src = command_hub_url;
				document.body.appendChild(command_hub);

				window.addEventListener("message", function(event) {
					if(event.source == command_hub.contentWindow && event.data.status == "ready") {
						command_hub_loaded = true;
					}
				});
				
				function handleGroup(entry, group_name, group_id) {
					// make contact with the command hub
					command_hub.contentWindow.postMessage({action: "join", name: group_name, id: group_id}, "*");

					// wait for a response
					window.addEventListener("message", function(event) {
						if(event.source == command_hub.contentWindow && event.data.status == "not_logged_in") {
							// we're not logged in, try to mark it anyway incase we're already a member of the group
							markEntryCompleted(entry);
							gleamSolverUI.showError('You must be logged into <a href="https://steamcommunity.com" style="color: #fff" target="_blank">steamcommunity.com</a>');
						} else if(event.source == command_hub.contentWindow && event.data.id == group_id) {
							if(event.data.status == "already_joined") {
								// user was already a member, don't even consider leaving
								markEntryCompleted(entry);
							} else if(event.data.status == "joined") {
								markEntryCompleted(entry, function() {
									if(script_mode != "undo_none") {
										// depending on mode, leave the group
										command_hub.contentWindow.postMessage({action: "leave", name: group_name, id: group_id}, "*");
									}
								});
							}
						}
					}, false);
				}

				return {
					handleEntry: function(entry) {
						var group_name = entry.entry_method.config3,
							group_id = entry.entry_method.config4;
						
						if(command_hub_loaded) {
							handleGroup(entry, group_name, group_id);
						} else {
							// wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(command_hub_loaded) {
									clearInterval(temp_interval);
									handleGroup(entry, group_name, group_id);
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
			initGleam: function() {
				// wait for gleam to finish loading
				temp_interval = setInterval(function() {
					if(jQuery(".popup-blocks-container") !== null) {
						clearInterval(temp_interval);
						gleam = angular.element(jQuery(".popup-blocks-container")).scope();
						script_mode = determineMode();
						checkAuthentications();
						gleamSolverUI.loadUI();
					}
				}, 500);
			},

			completeEntries: function() {
				handleEntries();
			},
			
			getMode: function() {
				return script_mode;
			},
			
			setMode: function(mode) {
				if(valid_modes.indexOf(mode) != -1) {
					script_mode = mode;
				}
			},

			getQuantity: function() {
				return gleam.incentives[0].quantity;
			},
			
			getRemainingQuantity: function() {
				if(gleam.campaign.campaign_type == "Reward") {
					var est_remaining = gleam.incentives[0].quantity - Math.floor(gleam.campaign.entry_count/gleam.incentives[0].actions_required);
					return Math.max(0, est_remaining);
				} else {
					return false;
				}
			},

			// estimate the probability of winning a raffle
			calcWinChance: function() {
				var your_entries = gleam.contestantEntries(),
					total_entries = gleam.campaign.entry_count,
					num_rewards = gleam.incentives[0].quantity;
					
				return Math.round(10000 * (1 - Math.pow((total_entries - your_entries) / total_entries, num_rewards))) / 100;
			}
		};
	})();

	var gleamSolverUI = (function() {
		var active_errors = [],
			active_notifications = {},
			disable_ui_click = false,
		    button_class = "btn btn-embossed btn-info",
		    button_style = { margin: "2px 0px 2px 16px" },
			selectbox_style = { margin: "0px 0px 0px 16px" },
		    container_style = { fontSize: "18px", left: "0px", position: "fixed", top: "0px", width: "100%", zIndex: "9999999999" },
			notification_style = { background: "#000", boxShadow: "-10px 2px 10px #000", color: "#3498db", padding: "8px", width: "100%", },
			error_style = { background: "#e74c3c", boxShadow: "-10px 2px 10px #e74c3c", color: "#fff", padding: "8px", width: "100%" },
			quantity_style = { fontStyle: "italic", margin: "12px 0px 0px 0px" },
			win_chance_style = { display: "inline-block", fontSize: "14px", lineHeight: "14px", position: "relative", top: "-4px" },		
			win_chance_container = jQuery("<span>", { css: win_chance_style }),
			gleam_solver_container = jQuery("<div>", { css: container_style }),
			gleam_solver_main_ui = null;
			
		// push the page down to make room for notifications
		function updateTopMargin() {
			jQuery("html").css("margin-top", (gleam_solver_container.is(":visible") ? gleam_solver_container.outerHeight() : 0));
		}
		
		function showQuantity() {
			var num_rewards = gleamSolver.getQuantity(),
				num_remaining = gleamSolver.getRemainingQuantity(),
				msg = "(" + num_rewards.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + (num_rewards == 1 ? "reward" : "rewards") + " being given away" + 
					(num_remaining === false ? "" : ";<br>~" + num_remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " remaining") + ")";

			$(".incentive-description h3").append(jQuery("<div>", { html: msg, css: quantity_style }));
		}
		
		function updateWinChance() {
			win_chance_container.text("(~" + gleamSolver.calcWinChance() + "% to win)");
		}

		return {
			// print the UI
			loadUI: function() {
				gleam_solver_main_ui = 					
					jQuery("<div>", { css: notification_style }).append(
					jQuery("<span>", { text: "Gleam.solver v" + current_version })).append(
					jQuery("<select>", { css: selectbox_style }).append(
						jQuery("<option>", { text: "Instant-win Mode", value: "undo_all", selected: (gleamSolver.getMode() == "undo_all") })).append(
						jQuery("<option>", { text: "Raffle Mode", value: "undo_none", selected: (gleamSolver.getMode() == "undo_none") })).append(
						jQuery("<option>", { text: "Instant-win Full Mode", value: "undo_some", selected: (gleamSolver.getMode() == "undo_some") })).change(function() {
							gleamSolver.setMode(jQuery(this).val());
						})).append(
					jQuery("<a>", { text: "Click here to auto-complete", class: button_class, css: button_style}).click(function() {
						if(!disable_ui_click) {
							// prevent double click
							disable_ui_click = true;
							
							jQuery(this).parent().slideUp(400, function() {
								updateTopMargin();
								gleamSolver.completeEntries();
								disable_ui_click = false;
							});
						}
					})
				);
				
				jQuery("body").append(gleam_solver_container);
				jQuery("#current-entries .status.ng-binding").append(win_chance_container);
				jQuery("html").css("overflow-y", "scroll");
				gleam_solver_container.append(gleam_solver_main_ui);			
				setInterval(updateWinChance, 500);
				showQuantity();
				updateTopMargin();
			},
			
			showUI: function() {
				gleam_solver_main_ui.slideDown(400);
			},

			// print an error
			showError: function(msg) {
				// don't print the same error multiple times
				if(active_errors.indexOf(msg) == -1) {
					active_errors.push(msg);
					gleam_solver_container.append(jQuery("<div>", { css: error_style }).html("Gleam.solver Error: " + msg));
					updateTopMargin();
				}
			},
			
			// display or update a notification
			showNotification: function(notification_id, msg) {
				if(!active_notifications[notification_id]) {
					// new notification
					active_notifications[notification_id] = jQuery("<div>", { css: notification_style });
					gleam_solver_container.append(active_notifications[notification_id]);
				}

				// update notification
				active_notifications[notification_id].html("Gleam.solver Notification: " + msg);
				updateTopMargin();
			},

			// remove a notification
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

	// does the actual steam group joining/leaving
	function initSteamCommandHub() {
		var active_groups = null,
			logged_in = g_steamID !== false;

		if(logged_in) {
			// make note of what groups we're already a member of, so that we don't leave any of them
			jQuery.ajax({
				url: "https://steamcommunity.com/my/groups",
				async: false,
				complete: function(data) {
					if(data.responseText.toLowerCase().indexOf("you belong to 0 groups") != -1) {
						// user isn't a member of any steam groups
						active_groups = [];
					} else {
						jQuery(data.responseText).find(".groupBlock a.linkTitle").each(function() {
							var group_name = jQuery(this).attr("href").replace("https://steamcommunity.com/groups/", "");
							if(active_groups === null) active_groups = [];
							active_groups.push(group_name);
						});
					}
				}
			});
		}
		
		parent.postMessage({status: "ready"}, "*");

		// wait for our parent to tell us what to do
		window.addEventListener("message", function(event) {
			if(event.source == parent && event.origin == "https://gleam.io") {
				if(!logged_in) {
					parent.postMessage({status: "not_logged_in"}, "*");
				} else if(active_groups !== null) {
					if(event.data.action == "join") {
						joinGroup(event.data.name, event.data.id);
					} else if(event.data.action == "leave") {
						leaveGroup(event.data.name, event.data.id);
					}
				}
			}
		}, false);

		function joinGroup(group_name, group_id) {
			if(active_groups.indexOf(group_name) != -1) {
				// already a member
				parent.postMessage({status: "already_joined", name: group_name, id: group_id}, "*");
			} else {
				jQuery.ajax({
					url: "https://steamcommunity.com/groups/" + group_name,
					type: "POST",
					data: {action: "join", sessionID: g_sessionID},
					complete: function() {
						parent.postMessage({status: "joined", name: group_name, id: group_id}, "*");
					}
				});
			}
		}

		function leaveGroup(group_name, group_id) {
			// never leave a group that the user was already a member of
			if(active_groups.indexOf(group_name) == -1) {
				// no real need to let the gleamSolver know we left the group
				jQuery.ajax({
					url: jQuery(".playerAvatar a").attr("href").replace("http://", "https://") + "home_process",
					type: "POST",
					data: {sessionID: g_sessionID, action: "leaveGroup", groupId: group_id}
				});
			}
		}
	}

	// determine where we are and call the appropriate function
	if(document.location.hostname == "gleam.io") {
		gleamSolver.initGleam();
	} else if(document.location == command_hub_url) {
		initSteamCommandHub();
	}
})();