const webSocketConnection = "wss://2i0u9t6kea.execute-api.ap-south-1.amazonaws.com/dev";
const turnServerIPAddress = "exinfotech.in";
const turnServerPort = "5349";
const turnServerUserName = "cosmoturn";
const turnServerPassword = "cosmoturn";
const configuration = {
    iceServers: [
        {
            urls: 'stun:stun.' + turnServerIPAddress + ':' + turnServerPort
        },
        {
            urls: 'turn:turn.' + turnServerIPAddress + ':' + turnServerPort,
            username: turnServerUserName,
            credential: turnServerPassword
        }
    ]
}

var existingTracks = [], socket, localStream, connection, channel, callid, username;

initUI();
getLocalWebCamFeed();

function initUI() {

    var params = new URLSearchParams(window.location.search);
    var btnTxt, meetUrl;

    if (params.has("cid")) {
        callid = params.get("cid");
        btnTxt = "Join";
        meetUrl = window.location;
    }
    else {
        callid = uuidv4();
        btnTxt = "Initiate";

        var getUrl = window.location;
        var baseUrl = getUrl.protocol + "//" + getUrl.host + "/" + getUrl.pathname.split('/')[1];
        //var baseUrl = 'file:///Users/sudeepsehgal/Desktop/webrtc-assignment/webrtc-application/web-meet.html';
        meetUrl = `${baseUrl}?cid=${callid}`;
    }

    document.querySelector("#meet-url").innerHTML = meetUrl;
    document.querySelector("#meet-url1").innerHTML = meetUrl;
    document.querySelector("#meet-init").innerHTML = btnTxt;
    document.querySelector("#init-heading").innerHTML = btnTxt + ' Meeting';

    document.querySelector("#meet-init").addEventListener("click", initMeet);
    document.querySelector("#chat-button").addEventListener("click", sendMessage);
    document.querySelector("#mute-audio").addEventListener("click", toggleAudio);
    document.querySelector("#hide-video").addEventListener("click", toggleVdeo);
    document.querySelector("#hang-call").addEventListener("click", hangCall);
}

function hangCall() {

    disconnectRTCPeerConnection();
    socket.close();
    socket = undefined;

    document.querySelector("#container").classList.add("nodisplay");
    document.querySelector("#initc").classList.remove("nodisplay");
}

function toggleAudio() {
    var currentState = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !currentState;

    if (!currentState) document.querySelector("#mute-audio").innerHTML = "Mute Audio";
    else document.querySelector("#mute-audio").innerHTML = "Unmute Audio";

}

function toggleVdeo() {
    var currentState = localStream.getVideoTracks()[0].enabled;
    localStream.getVideoTracks()[0].enabled = !currentState;

    if (!currentState) document.querySelector("#hide-video").innerHTML = "Hide Video";
    else document.querySelector("#hide-video").innerHTML = "Show Video";

}

function initMeet() {
    var uname = document.querySelector("#user-name").value;
    if (uname.trim() == '') {
        alert('please enter your name');
        return;
    }
    else {
        username = uname.trim();
        document.querySelector("#local-user").innerHTML = username;
        document.querySelector("#initc").classList.add("nodisplay");
        document.querySelector("#container").classList.remove("nodisplay");

        initiatSocket();
    }
}

function sendMessage() {
    var messageText = document.querySelector("#chat-input").value.trim();
    document.querySelector("#chat-input").value = '';

    if (messageText != '') {

        if (channel) {
            channel.send(JSON.stringify({
                "message": messageText,
                user: username
            }));
        }

        var msg = `<strong>${username}</strong> ${messageText} <br><br>`;
        document.querySelector("#chat-window").innerHTML += (msg);
    }
}

/*
    Get local camera permission from user and initiate socket and WebRTC connection
*/
function getLocalWebCamFeed() {

    constraints = {
        audio: true,
        video: {
            facingMode: "user",
            width: { ideal: 1028 },
            height: { ideal: 720 }
        }
    }

    navigator.getWebcam = (navigator.getUserMedia || navigator.webKitGetUserMedia || navigator.moxGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
    if (navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia(constraints)
            .then(function (stream) {
                localStream = stream;
                document.getElementById("localVideo").srcObject = stream;
                document.getElementById("localVideoInit").srcObject = stream;
                //initiatSocketAndPeerConnection(stream);
            })
            .catch(function (e) { log(e.name + ": " + e.message); });
    }
    else {
        navigator.getWebcam({ audio: true, video: true },
            function (stream) {
                localStream = stream;
                document.getElementById("localVideo").srcObject = stream;
                document.getElementById("localVideoInit").srcObject = stream;
                //initiatSocketAndPeerConnection(stream);
            },
            function () {
                log("Web cam is not accessible.");
            });
    }
}

/*
    This function creates the socket connection and WebRTC connection. 
    This is also responsible for changing media tracks when user switches mobile cameras (Front and back)
*/
function initiatSocket() {

    if (typeof socket === 'undefined') {
        connectToWebSocket();
    } else {
        existingTracks.forEach(function (existingTrack, index) {
            existingTrack.replaceTrack(localStream.getTracks()[index]);
        });
    }
}



function disconnectRTCPeerConnection() {

    if (connection) {
        connection.close();
        connection = null;
        console.log('connection disposed');
    }
}

/*
    Connect to the web socket and handle recieved messages from web sockets
*/
function connectToWebSocket() {
    socket = new WebSocket(`${webSocketConnection}?callid=${callid}&uname=${username} `);

    // Create WebRTC connection only if the socket connection is successful.
    socket.onopen = function (event) {
        log('WebSocket Connection Open.');
    };

    // Handle messages recieved in socket
    socket.onmessage = function (event) {
        if (event.data == "")
            return;

        jsonData = JSON.parse(event.data);

        switch (jsonData.type) {
            case 'webrtc-candidate':
                handleCandidate(jsonData.data, jsonData.id);
                break;
            case 'webrtc-offer':
                document.querySelector("#remote-user").classList.remove('nodisplay');
                document.querySelector("#remote-user").innerHTML = jsonData.user;

                disconnectRTCPeerConnection();
                createRTCPeerConnection();

                handleOffer(jsonData.data, jsonData.id);
                break;
            case 'webrtc-answer':
                handleAnswer(jsonData.data, jsonData.id);
                break;
            case 'user-joined':
                document.querySelector("#remote-user").classList.remove('nodisplay');
                document.querySelector("#remote-user").innerHTML = jsonData.user;

                disconnectRTCPeerConnection();
                createRTCPeerConnection();
                createAndSendOffer();
                break;
            default:
                break
        }
    };

    socket.onerror = function (event) {
        console.error(event);
        log('WebSocket Connection Error. Make sure web socket URL is correct and web socket server is up and running at - ' + webSocketConnection);
    };

    socket.onclose = function (event) {
        log('WebSocket Connection Closed. Please Reload the page.');
    };
}

function log(message) {
    console.log(message)
}


/*
    This is responsible for creating an RTCPeerConnection and handle it's events.
*/
function createRTCPeerConnection() {
    connection = new RTCPeerConnection(configuration);

    // Add both video and audio tracks to the connection
    for (const track of localStream.getTracks()) {
        log("Sending Stream.")
        existingTracks.push(connection.addTrack(track, localStream));
    }

    // This event handles displaying remote video and audio feed from the other peer
    connection.ontrack = event => {
        log("Recieved Stream.");
        document.getElementById("localVideo").srcObject = event.streams[0];
    }

    // This event handles the received data channel from the other peer
    connection.ondatachannel = function (event) {
        log("Recieved a DataChannel.")
        channel = event.channel;
        setChannelEvents(channel);
    };

    // This event sends the ice candidates generated from Stun or Turn server to the Receiver over web socket
    connection.onicecandidate = event => {
        if (event.candidate) {
            log("Sending Ice Candidate - " + event.candidate.candidate);

            socket.send(JSON.stringify(
                {
                    action: 'onAction',
                    type: 'webrtc-candidate',
                    data: event.candidate,
                    callid: callid
                }
            ));
        }
    }

    // This event logs messages and handles button state according to WebRTC connection state changes
    connection.onconnectionstatechange = function (event) {
        switch (connection.connectionState) {
            case "connected":
                log("Web RTC Peer Connection Connected.");
                break;
            case "disconnected":
                log("Web RTC Peer Connection Disconnected. Please reload the page to reconnect.");
                break;
            case "failed":
                log("Web RTC Peer Connection Failed. Please reload the page to reconnect.");
                console.log(event);
                break;
            case "closed":
                log("Web RTC Peer Connection Failed. Please reload the page to reconnect.");
                break;
            default:
                break;
        }
    }

    log("Web RTC Peer Connection Created.");
}

/*
    Creates and sends the Offer to the Receiver
    Creates a Data channel for exchanging text messages
    This function is invoked by the Caller
*/
function createAndSendOffer() {
    if (channel) {
        channel.close();
    }

    // Create Data channel
    channel = connection.createDataChannel('channel', {});
    setChannelEvents(channel);

    // Create Offer
    connection.createOffer().then(
        offer => {
            log('Sent The Offer.');

            // Send Offer to other peer
            socket.send(JSON.stringify(
                {
                    action: 'onAction',
                    type: 'webrtc-offer',
                    data: offer,
                    callid: callid,
                    user: username
                }
            ));

            // Set Offer for negotiation
            connection.setLocalDescription(offer);
        },
        error => {
            log('Error when creating an offer.');
            console.error(error);
        }
    );
}

/*
    Creates and sends the Answer to the Caller
    This function is invoked by the Receiver
*/
function createAndSendAnswer() {

    // Create Answer
    connection.createAnswer().then(
        answer => {
            log('Sent The Answer.');

            // Set Answer for negotiation
            connection.setLocalDescription(answer);

            // Send Answer to other peer
            socket.send(JSON.stringify(
                {
                    action: 'onAction',
                    type: 'webrtc-answer',
                    data: answer,
                    callid: callid
                }
            ));
        },
        error => {
            log('Error when creating an answer.');
            console.error(error);
        }
    );
}

/*
    Accepts ICE candidates received from the Caller
*/
function handleCandidate(candidate, id) {

    log("Adding Ice Candidate - " + candidate.candidate);
    connection.addIceCandidate(new RTCIceCandidate(candidate));
}

/*
    Accepts Offer received from the Caller
*/
function handleOffer(offer, id) {

    log("Recieved The Offer.");
    connection.setRemoteDescription(new RTCSessionDescription(offer));
    createAndSendAnswer();
}

/*
    Accetps Answer received from the Receiver
*/
function handleAnswer(answer, id) {

    log("Recieved The Answer");
    connection.setRemoteDescription(new RTCSessionDescription(answer));
}

/*
    Generate a unique ID for the peer
*/
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/*
    Handle Data Channel events
*/
function setChannelEvents(channel) {
    channel.onmessage = function (event) {

        var data = JSON.parse(event.data);
        var msg = `<strong> ${data.user}</strong > ${data.message} <br><br>`;
        document.querySelector("#chat-window").innerHTML += (msg);
    };

    channel.onerror = function (event) {
        log('DataChannel Error.');
        console.error(event)
    };

    channel.onclose = function (event) {
        log('DataChannel Closed.');
    };
}
