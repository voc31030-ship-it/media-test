(function () {
    "use strict";

    var projectContainer = document.getElementById("project-gallery");
    var managerGrid = document.getElementById("media-manager-grid");
    var fileInput = document.getElementById("media-files");
    var uploadTrigger = document.getElementById("upload-trigger");
    var mediaStatus = document.getElementById("media-status");
    var projectStatus = document.getElementById("project-media-status");
    var authStatus = document.getElementById("auth-status");
    var authForm = document.getElementById("auth-form");
    var authSession = document.getElementById("auth-session");
    var authUserEmail = document.getElementById("auth-user-email");
    var signInButton = document.getElementById("sign-in");
    var signUpButton = document.getElementById("sign-up");
    var signOutButton = document.getElementById("sign-out");
    var managerApproved = false;
    var config = window.SUPABASE_CONFIG;
    var sessionStorageKey = "webuild-supabase-session";
    var maximumFileSize = config && (config.maxFileSizeBytes || config.maxSizeBytes) || 52428800;

    function configured() {
        return config && config.url && config.publishableKey &&
            config.url.indexOf("YOUR_PROJECT_ID") === -1 &&
            config.publishableKey !== "YOUR_SUPABASE_PUBLISHABLE_KEY";
    }

    function apiUrl(path) {
        return config.url.replace(/\/+$/, "") + path;
    }

    function readResponse(response) {
        return response.text().then(function (text) {
            var body = null;
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch (error) {
                    body = { message: text };
                }
            }
            if (!response.ok) {
                var message = body && (body.message || body.msg || body.error_description || body.error);
                throw new Error(message || ("Supabase request failed (" + response.status + ")."));
            }
            return body;
        });
    }

    function request(path, options, authenticated) {
        var headers = new Headers(options && options.headers ? options.headers : {});
        headers.set("apikey", config.publishableKey);
        headers.set("Authorization", "Bearer " + (authenticated ? authenticated.access_token : config.publishableKey));
        return fetch(apiUrl(path), Object.assign({}, options || {}, { headers: headers })).then(readResponse);
    }

    function getSession() {
        var stored = window.localStorage.getItem(sessionStorageKey);
        return stored ? JSON.parse(stored) : null;
    }

    function saveSession(session) {
        if (!session || !session.access_token || !session.refresh_token || !session.user) {
            throw new Error("Supabase did not return a complete sign-in session.");
        }
        if (!session.expires_at) {
            session.expires_at = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
        }
        window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    }

    function clearSession() {
        window.localStorage.removeItem(sessionStorageKey);
    }

    function authRequest(path, body) {
        return request(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    }

    function validSession() {
        var session;
        try {
            session = getSession();
        } catch (error) {
            return Promise.reject(new Error("Could not read the saved sign-in session: " + error.message));
        }
        if (!session) {
            return Promise.resolve(null);
        }
        if (session.expires_at > Math.floor(Date.now() / 1000) + 60) {
            return Promise.resolve(session);
        }
        return authRequest("/auth/v1/token?grant_type=refresh_token", {
            refresh_token: session.refresh_token
        }).then(function (refreshed) {
            saveSession(refreshed);
            return refreshed;
        }).catch(function (error) {
            clearSession();
            updateAuthUi(null, false);
            throw new Error("Your sign-in expired. Please sign in again. " + error.message);
        });
    }

    function setMessage(element, message, isError) {
        if (!element) {
            return;
        }
        element.textContent = message;
        element.classList.toggle("text-danger", Boolean(isError));
        element.classList.toggle("text-body", !isError);
        if (element === projectStatus) {
            element.classList.toggle("d-none", !isError);
        }
    }

    function updateAuthUi(session, isApproved) {
        managerApproved = Boolean(session && isApproved);
        if (authForm && authSession) {
            authForm.classList.toggle("d-none", Boolean(session));
            authSession.classList.toggle("d-none", !session);
            authSession.classList.toggle("d-flex", Boolean(session));
            authUserEmail.textContent = session ? session.user.email : "";
            fileInput.disabled = !managerApproved;
            uploadTrigger.disabled = !managerApproved;
        }
    }

    function checkManagerAccess(session) {
        var query = "?select=user_id&user_id=eq." + encodeURIComponent(session.user.id);
        return request("/rest/v1/project_media_managers" + query, { method: "GET" }, session)
            .then(function (managers) {
                return managers.length > 0;
            });
    }

    function publicFileUrl(path) {
        return apiUrl("/storage/v1/object/public/" + encodeURIComponent(config.bucket) + "/" +
            path.split("/").map(encodeURIComponent).join("/"));
    }

    function mediaType(media) {
        return media.mime_type || "application/octet-stream";
    }

    function createPreview(media, className) {
        var type = mediaType(media);
        var preview;
        if (type.indexOf("video/") === 0) {
            preview = document.createElement("video");
            preview.controls = true;
            preview.preload = "metadata";
        } else {
            preview = document.createElement("img");
            preview.alt = media.name;
        }
        preview.className = className;
        preview.src = publicFileUrl(media.path);
        return preview;
    }

    function loadMedia() {
        return request("/rest/v1/project_media?select=id,name,path,mime_type,created_at&order=created_at.desc", {
            method: "GET"
        }).then(function (mediaItems) {
            renderProjectMedia(mediaItems);
            renderManager(mediaItems);
            return mediaItems;
        });
    }

    function renderProjectMedia(mediaItems) {
        if (!projectContainer) {
            return;
        }
        projectContainer.querySelectorAll(".uploaded-project-item").forEach(function (card) {
            card.remove();
        });
        mediaItems.forEach(function (media) {
            var card = document.createElement("div");
            var box = document.createElement("div");
            var title = document.createElement("div");
            var name = document.createElement("p");
            var description = document.createElement("span");

            card.className = "col-xl-4 col-lg-6 col-md-6 portfolio-item uploaded-project-item";
            box.className = "position-relative portfolio-box";
            title.className = "portfolio-title shadow-sm";
            name.className = "h4 text-uppercase text-truncate mb-1";
            name.textContent = media.name;
            description.className = "text-body";
            description.textContent = mediaType(media).indexOf("video/") === 0 ? "Uploaded video" : "Uploaded image";
            box.appendChild(createPreview(media, "uploaded-media-preview"));
            title.appendChild(name);
            title.appendChild(description);
            box.appendChild(title);
            card.appendChild(box);
            projectContainer.appendChild(card);
        });

        if (window.jQuery && window.jQuery.fn.isotope) {
            window.jQuery(projectContainer).isotope("reloadItems").isotope({ sortBy: "original-order" });
        }
    }

    function renderManager(mediaItems) {
        if (!managerGrid) {
            return;
        }
        managerGrid.textContent = "";
        if (mediaItems.length === 0) {
            var emptyState = document.createElement("p");
            emptyState.className = "col-12 text-center text-body";
            emptyState.textContent = "No media uploaded yet.";
            managerGrid.appendChild(emptyState);
            return;
        }

        mediaItems.forEach(function (media) {
            var column = document.createElement("div");
            var card = document.createElement("div");
            var preview = document.createElement("div");
            var filename = document.createElement("p");

            column.className = "col-xl-4 col-md-6";
            card.className = "media-admin-card";
            preview.className = "media-admin-preview mb-3";
            preview.appendChild(createPreview(media, ""));
            filename.className = "text-truncate fw-bold mb-3";
            filename.textContent = media.name;
            card.appendChild(preview);
            card.appendChild(filename);

            if (managerApproved) {
                var removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.className = "btn btn-outline-primary w-100";
                removeButton.textContent = "Delete";
                removeButton.addEventListener("click", function () {
                    removeButton.disabled = true;
                    validSession().then(function (session) {
                        if (!session || !managerApproved) {
                            throw new Error("Sign in with an approved media-manager account to delete files.");
                        }
                        return deleteMedia(media, session);
                    }).then(function () {
                        setMessage(mediaStatus, "Media deleted.", false);
                        return loadMedia();
                    }).catch(function (error) {
                        removeButton.disabled = false;
                        setMessage(mediaStatus, error.message, true);
                    });
                });
                card.appendChild(removeButton);
            }

            column.appendChild(card);
            managerGrid.appendChild(column);
        });
    }

    function safeFilename(name) {
        var extension = name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
        var base = name.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
        return (base || "media") + (extension ? "." + extension : "");
    }

    function uploadFile(file, session) {
        var path = session.user.id + "/" + Date.now() + "-" +
            Math.random().toString(36).slice(2, 10) + "-" + safeFilename(file.name);
        var objectPath = "/storage/v1/object/" + encodeURIComponent(config.bucket) + "/" +
            path.split("/").map(encodeURIComponent).join("/");

        return request(objectPath, {
            method: "POST",
            headers: {
                "Content-Type": file.type,
                "x-upsert": "false",
                "cache-control": "3600"
            },
            body: file
        }, session).then(function () {
            return request("/rest/v1/project_media", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                    name: file.name,
                    path: path,
                    mime_type: file.type,
                    uploaded_by: session.user.id
                })
            }, session).catch(function (metadataError) {
                return request("/storage/v1/object/" + encodeURIComponent(config.bucket), {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prefixes: [path] })
                }, session).then(function () {
                    throw metadataError;
                }).catch(function (cleanupError) {
                    if (cleanupError === metadataError) {
                        throw metadataError;
                    }
                    throw new Error(metadataError.message + " The file was uploaded, but cleanup failed: " + cleanupError.message);
                });
            });
        });
    }

    function deleteMedia(media, session) {
        var objectPath = "/storage/v1/object/" + encodeURIComponent(config.bucket);
        return request(objectPath, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefixes: [media.path] })
        }, session).then(function () {
            var filter = "?id=eq." + encodeURIComponent(media.id);
            return request("/rest/v1/project_media" + filter, {
                method: "DELETE",
                headers: { "Prefer": "return=minimal" }
            }, session);
        }).catch(function (error) {
            throw new Error("Could not delete " + media.name + ": " + error.message);
        });
    }

    function signIn() {
        var email = document.getElementById("auth-email").value.trim();
        var password = document.getElementById("auth-password").value;
        if (!email || !password) {
            setMessage(authStatus, "Enter your email and password.", true);
            return;
        }
        signInButton.disabled = true;
        authRequest("/auth/v1/token?grant_type=password", { email: email, password: password })
            .then(function (session) {
                saveSession(session);
                return checkManagerAccess(session).then(function (isApproved) {
                    updateAuthUi(session, isApproved);
                    setMessage(authStatus, isApproved
                        ? "Signed in. You can now upload or delete project media."
                        : "Signed in, but this account is not approved to manage project media.", !isApproved);
                    return loadMedia().catch(function (error) {
                        setMessage(mediaStatus, error.message, true);
                    });
                });
            }).catch(function (error) {
                clearSession();
                updateAuthUi(null, false);
                setMessage(authStatus, error.message, true);
            }).then(function () {
                signInButton.disabled = false;
            });
    }

    function signUp() {
        var email = document.getElementById("auth-email").value.trim();
        var password = document.getElementById("auth-password").value;
        if (!email || !password) {
            setMessage(authStatus, "Enter an email and password to create an account.", true);
            return;
        }
        signUpButton.disabled = true;
        authRequest("/auth/v1/signup", { email: email, password: password })
            .then(function (result) {
                if (result.access_token) {
                    saveSession(result);
                    updateAuthUi(result, false);
                }
                setMessage(authStatus, "Account created. Confirm your email if requested, then ask the site administrator to approve this account for media management.", false);
            }).catch(function (error) {
                setMessage(authStatus, error.message, true);
            }).then(function () {
                signUpButton.disabled = false;
            });
    }

    function signOut() {
        var session;
        try {
            session = getSession();
        } catch (error) {
            clearSession();
            updateAuthUi(null, false);
            setMessage(authStatus, error.message, true);
            return;
        }
        clearSession();
        updateAuthUi(null, false);
        setMessage(authStatus, "Signed out.", false);
        if (session) {
            request("/auth/v1/logout", { method: "POST" }, session).catch(function (error) {
                setMessage(authStatus, "Signed out on this device, but the server sign-out request failed: " + error.message, true);
            });
        }
    }

    function initializeAuth() {
        return validSession().then(function (session) {
            if (!session) {
                updateAuthUi(null, false);
                return;
            }
            return checkManagerAccess(session).then(function (isApproved) {
                updateAuthUi(session, isApproved);
                setMessage(authStatus, isApproved
                    ? "Signed in as an approved media manager."
                    : "This account is not approved to manage project media.", !isApproved);
            }).catch(function (error) {
                updateAuthUi(null, false);
                setMessage(authStatus, error.message, true);
            });
        }).catch(function (error) {
            setMessage(authStatus, error.message, true);
        });
    }

    if (!configured()) {
        var setupMessage = "Connect Supabase first: set your project URL and publishable key in js/supabase-config.js.";
        setMessage(mediaStatus, setupMessage, true);
        setMessage(projectStatus, setupMessage, true);
        if (managerGrid) {
            managerGrid.textContent = setupMessage;
        }
        if (authForm) {
            authForm.classList.add("d-none");
        }
    } else {
        if (signInButton) {
            signInButton.addEventListener("click", signIn);
        }
        if (signUpButton) {
            signUpButton.addEventListener("click", signUp);
        }
        if (signOutButton) {
            signOutButton.addEventListener("click", signOut);
        }
        if (uploadTrigger) {
            uploadTrigger.addEventListener("click", function () {
                if (managerApproved) {
                    fileInput.click();
                }
            });
        }
        if (fileInput) {
            fileInput.addEventListener("change", function () {
                var files = Array.prototype.slice.call(fileInput.files || []);
                var invalidFile = files.find(function (file) {
                    return file.type.indexOf("image/") !== 0 && file.type.indexOf("video/") !== 0;
                });
                var oversizedFile = files.find(function (file) {
                    return file.size > maximumFileSize;
                });

                if (invalidFile) {
                    setMessage(mediaStatus, invalidFile.name + " is not an image or video.", true);
                    fileInput.value = "";
                    return;
                }
                if (oversizedFile) {
                    var maximumFileSizeMb = Math.floor(maximumFileSize / (1024 * 1024));
                    setMessage(mediaStatus, oversizedFile.name + " is over the configured " + maximumFileSizeMb + " MB upload limit.", true);
                    fileInput.value = "";
                    return;
                }
                if (files.length === 0) {
                    return;
                }

                uploadTrigger.disabled = true;
                setMessage(mediaStatus, "Uploading " + files.length + (files.length === 1 ? " file..." : " files..."), false);
                validSession().then(function (session) {
                    if (!session || !managerApproved) {
                        throw new Error("Sign in with an approved media-manager account to upload files.");
                    }
                    return files.reduce(function (promise, file) {
                        return promise.then(function () {
                            return uploadFile(file, session);
                        });
                    }, Promise.resolve());
                }).then(function () {
                    setMessage(mediaStatus, files.length + (files.length === 1 ? " file uploaded to the project page." : " files uploaded to the project page."), false);
                    return loadMedia();
                }).catch(function (error) {
                    setMessage(mediaStatus, error.message, true);
                    return loadMedia().catch(function (refreshError) {
                        setMessage(mediaStatus, error.message + " Could not refresh the gallery: " + refreshError.message, true);
                    });
                }).then(function () {
                    uploadTrigger.disabled = !managerApproved;
                    fileInput.value = "";
                });
            });
        }

        Promise.all([initializeAuth(), loadMedia()]).catch(function (error) {
            setMessage(mediaStatus, error.message, true);
            setMessage(projectStatus, error.message, true);
        });
    }
})();
