/*
 Shelly - GAE Remote API Shell Interface
 andre.leblanc@webfilings.com
 */
Shelly = (function () {
    var SHA = function (txt) { return new jsSHA(txt, "TEXT").getHash("SHA-256", "HEX"); };
    var _head ="";// "<link href='http://netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.min.css' rel='stylesheet' />";
    var _body = "__BODY__";
    var statusBar = {

        timer: null,
        stash: null,
        FLASH_DURATION: 500,
        initialize: function (el) {
            this.el = el;
            return this;
        },
        clear: function () {
            this.el.html("");
            this.stash = null;
        },
        unstash: function () {
            this.el.html(this.stash || "");
            this.stash = null;
        },
        flash: function (message) {
            this.setMessage(message, this.FLASH_DURATION);
        },
        setMessage: function(message, duration) {
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            if (!duration) {
                this.stash = null;
                this.el.html(message);
                return;
            } else {
                this.stash = this.el.html();
                this.el.html(message);
                this.timer = setTimeout($.proxy(this.unstash, this), duration);
            }
        }
    };

    Script = function(name, contents, createdAt, modifiedAt) {
        this.name = name;
        this.createdAt = createdAt || new Date();
        this.modifiedAt = modifiedAt || new Date();
        this.contents = contents || "";
        this.computeHash();
    };

    Script.prototype.computeHash = function () {
        this.hash = SHA(this.contents);
        return this.hash;
    }

    var shelly = {
        initialize: function (document) {
            var self = this;
            this.sessionId = $("input[name='session']").val();
            if (!this.sessionId) {
                return;
            }
            $("head script", document).remove();
            $("body", document).empty().append(_body);
            setTimeout(function () {
                // set up the editor and resize events
                var $leftPane = $(".left-pane");
                self.editor = CodeMirror($leftPane.get(0), {
                    mode: 'python',
                    lineNumbers: true,
                    lineWrapping: true,
                    viewportMargin: Infinity
                });
                self.editor.on('change', $.proxy(self.onEditorChange, self));
                $(window).on('keypress', function (ke) {
                    if (ke.keyCode == 13 && (ke.ctrlKey || ke.metaKey)) {
                        self.executeEditorContents();
                    }
                });
                $("#run-button").on('click', $.proxy(self.executeEditorContents, self));
                $(window).on('resize', $.proxy(self.onResize, self));
                self.onResize();
                // setup the output 'console'
                self.output = $("div.right-pane");
                $("i.clear-console-button").on('click', $.proxy(self.clearConsole, self));
                self.output.on('click', function (e) {
                    if ($(e.target).hasClass('pyprompt')) {
                        if (self.promptMenu) {
                            self.promptMenu.remove();
                        }
                        self.createPromptMenu($(e.target));
                        e.stopPropagation();
                    }
                });
                $(document).on('click', function (e) {
                    if (self.promptMenu) {
                        self.promptMenu.remove();
                        self.promptMenu = null;
                    }
                });
                // setup storage
                chrome.storage.local.get("editor_contents", function (data) {
                    if (data.editor_contents) {
                        self.editor.setValue(data.editor_contents);
                    }
                });
                // setup resizer
                self.slider = $("div.slider");
                self.sliding;
                self.slider.on("mousedown", function (e) {
                    self.sliding = true;
                    $(document).css("-webkit-user-select", "none");
                    $(document).one("mouseup", function (e) {
                        $(document).css("-webkit-user-select", "text");
                        self.sliding = false;
                    });
                });
                $(document).on("mousemove", function (e) {
                    if (self.sliding) {
                        console.log("SliderEvent", e);
                        $leftPane.width(e.pageX-5);
                        $leftPane.trigger('resize');
                    }
                });

                // setup status bar
                self.statusBar = statusBar.initialize($("div.footer"));
                // setup toolbar
                var toolbar = $("div.toolbar");
                $("i,div", toolbar).on('mouseenter', function () {
                    statusBar.setMessage($(this).attr("title"));
                }).on('mouseleave', function () {
                    statusBar.setMessage("");
                });
                $("#open-dialog-button").on('click', $.proxy(self.openDialog, self));
                $("#save-button").on('click', $.proxy(self.onSaveButton, self));
                $("#save-as-button").on('click', $.proxy(self.onSaveAsButton, self));
                self.loadedScript = new Script("untitled", 'print "Hello World!"\n');
                self.loadedScript.makeNameUnique(function (name) {
                    self.editor.setValue(self.loadedScript.contents);
                    self.updateSaveStatus();
                    self.editor.focus();
                    self.statusBar.setMessage("");
                });
            }, 1);
        },
        createPromptMenu: function (promptTag) {
            var self = this;
            self.promptMenu = $("<ul class='menu'><li id='menu-reexec'>Re-execute</li><li id='menu-edit'>Edit</li></ul>");
            self.promptMenu.insertBefore(promptTag).css({top: '5px', left: '5px'});
            $("li", self.promptMenu).on("click", function () {
                var match = $(this).attr("id").match(/^menu\-(.*)$/);
                var pre = $(this).closest("pre.shell-input");

                if (match && match[1] == 'reexec') {
                    self.execute(pre.data("scriptBody"));
                } else if (match && match[1] == 'edit') {
                    self.editor.setValue(pre.data("scriptBody"));
                }
                self.promptMenu.remove();
                self.promptMenu = null;
            });
        },
        escapeHTML: function (html) {
            var entityMap = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': '&quot;',
                "'": '&#39;',
                "/": '&#x2F;'
            };

            return String(html).replace(/[&<>"'\/]/g, function (s) {
                return entityMap[s];
            });
        },
        executeEditorContents: function () {
            this.execute(this.getEditorContents());
        },
        execute: function (script) {
            this.printInput(script);
            $.post("shell.do", {statement: script, session: this.sessionId}, $.proxy(this.printOutput, this));
        },
        onStorageChange: function (changes, areaName) {
            console.log("Storagechanged", areaName, changes);

        },
        openDialog: function() {
            var self = this;
            this.dialog = $(".dialog").modal({onShow: function(dialog) {
                self.onDialogOpened(dialog);
            }});
        },
        onEditorChange: function () {
            if (this.checkTimer !== undefined) {
                clearTimeout(this.checkTimer);
            }
            var self = this;
            setTimeout(function() { self.updateSaveStatus(); }, 500);
        },
        closeDialog: function () {
            this.dialog.close();
        },
        onDialogOpened: function(dialog) {
            var self = this;
            self.refreshDialog();
            dialog.container.drags({handle:".modal-header"});
            $("select.saved-scripts", dialog.container).off('change').on('change', function () {
                if ($(this).val()) {
                    $("#open-button").removeClass("disabled");
                    $("#delete-button").removeClass("disabled");
                } else {
                    $("#open-button").addClass("disabled");
                    $("#delete-button").addClass("disabled");
                }
            });
            $("#open-button", dialog.container).on('click', function () {
                if (!$(this).hasClass('disabled')) {
                    self.loadScript($("select.saved-scripts").val());
                    self.dialog.close();
                }
            });
            $("#delete-button", dialog.container).on('click', function () {
                if (!$(this).hasClass('disabled')) {
                    var scriptName = $("select.saved-scripts").val();
                    if (confirm("Are you sure you want to delete " + scriptName)) {
                        self.deleteScript(scriptName);
                        self.refreshDialog();
                    }
                }
            });
            $("#cancel-button", dialog.container).off('click').on('click', function () {
                self.closeDialog();
            });
        },
        refreshDialog: function () {
            $("select.saved-scripts").empty();
            chrome.storage.local.get(null, function (data) {
                for (script in data) {
                    if (script.substring(0,10) == '__script__') {
                        $("select.saved-scripts").append("<option>" + script.substring(10) + "</option>");
                    }
                }
            });

            $("#open-button,#delete-button").addClass("disabled");
        },
        updateSaveStatus: function() {
            $("div#save-as-button").html(this.loadedScript.name);
            var dirty = true;
            if (this.loadedScript.hash == SHA(this.editor.getValue())) {
                $("i#save-button").removeClass("fa-floppy-o").addClass("fa-file");
                dirty = false;
            } else {
                $("i#save-button").removeClass("fa-file").addClass("fa-floppy-o");
            }
            chrome.storage.local.set({'editor_contents': this.editor.getValue()});
        },
        onSaveButton: function () {
            if (!this.loadedScript.saved) {
                this.onSaveAsButton();
                return;
            }
            this.loadedScript.contents = this.editor.getValue();
            this.loadedScript.computeHash();
            this.loadedScript.modifiedAt = new Date();
            var save = {};
            save['__script__' + this.loadedScript.name] = this.loadedScript;
            this.updateSaveStatus();
            chrome.storage.local.set(save, function () {
                console.log("Saved ", save);
            });

        },
        onSaveAsButton: function () {
            var name = prompt("Save script as...", this.loadedScript.name);
            if (!name) {
                return;
            }
            this.loadedScript.name = name;
            this.loadedScript.saved = true;
            this.onSaveButton();
        },
        deleteScript: function (scriptName) {
            if (this.loadedScript.name == scriptName) {
                this.loadedScript.hash = "";
                this.updateSaveStatus();
            }
            chrome.storage.local.remove("__script__" + this.loadedScript.name);
        },
        loadScript: function (scriptName) {
            var self = this;
            chrome.storage.local.get("__script__" + scriptName, function (data) {
                self.loadedScript = $.extend(new Script(), data["__script__" + scriptName]);
                console.log(self.loadedScript.contents);
                self.editor.setValue(self.loadedScript.contents);
                self.updateSaveStatus();
            });
        },
        onResize: function (event) {
            var $leftPane = $(".left-pane");
            this.editor.setSize($leftPane.width()-2, $leftPane.height()-32);
        },
        getEditorContents: function () {
            var contents = this.editor.getValue();
            var trimmed = contents.replace(/\n*$/, '');
            return trimmed;
        },
        clearConsole: function() {
            $(".right-pane pre").remove();
        },
        scrollConsole: function () {
            this.output.get(0).scrollTop = this.output.get(0).scrollHeight;
        },

        printInput: function (input) {
            var el = $("<pre class='shell-input'></pre>");
            var scriptBody = input.replace(/\n*$/, '');
            var lines = scriptBody.split("\n");
            var prefix;
            for (var i=0; i<lines.length; i++) {
                if (i == 0) {
                    el.append("<strong class='pyprompt'>&gt;&gt;&gt;</strong>&nbsp;" + this.escapeHTML(lines[i]) + "\n");
                } else {
                    el.append("<strong>...</strong>&nbsp;" + this.escapeHTML(lines[i]) + "\n");
                }
            }
            this.output.append(el);
            el.data('scriptBody', scriptBody);
            this.scrollConsole();
        },
        printOutput: function (output) {
            var el = $("<pre class='shell-output'></pre>");
            el.html(this.escapeHTML(output+"\n"));
            this.output.append(el);
            el.on("dblclick", function (e) {
                var sel = window.getSelection();
                sel.setBaseAndExtent(this, 0, this, 1);
            });
            this.scrollConsole();
        }
    };

    Script.prototype.makeNameUnique = function (callback) {
        var self = this;
        chrome.storage.local.get(null, function (data) {
            var tmpName = self.name;
            var i = 1;
            while (tmpName in data) {
                tmpName = self.name + "-" + num;
            }
            self.name = tmpName;
            callback(self.name);
        });

    }
    return shelly;
})();
$(document).ready(function () {
    Shelly.initialize(document);
});