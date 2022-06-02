import { io } from "https://cdn.socket.io/4.4.1/socket.io.esm.min.js";

let isAlreadyCalling = false;
let getCalled = false;

const socket = io({
   query: {
      key: localStorage.userKey,
   },
});

const streamHandlers = {
   success: function (stream) {
      const audio = new MediaStream(stream.getAudioTracks());
      const video = new MediaStream(stream.getVideoTracks());
      const localVideo = document.getElementById("local-video");

      if (localVideo) {
         localVideo.srcObject = stream;
      }

      peerConnection.addTrack(video.getTracks()[0], stream);
      // stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
   },
   error: function (error) {
      console.warn(error.message);
   },
};

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(streamHandlers.success).catch(streamHandlers.error);

socket.on("update-user-list", ({ users }) => {
   updateUserList(users);
});

socket.on("accept-user", (user) => {
   console.log("Got accepted as user: ", user.name);
   localStorage.setItem("userKey", user.socket);
   localStorage.setItem("userName", user.name);
});

function updateUserList(users) {
   const activeUserContainer = document.getElementById("active-user-container");

   while (activeUserContainer.firstChild && activeUserContainer.firstChild.id !== "panel-title") {
      activeUserContainer.removeChild(activeUserContainer.lastChild);
   }

   users.forEach((user) => {
      const userItemContainer = createUserItemContainer(user);
      activeUserContainer.appendChild(userItemContainer);
   });
}

function unselectUsersFromList() {
   const alreadySelectedUser = document.querySelectorAll(".active-user.active-user--selected");

   alreadySelectedUser.forEach((el) => {
      el.setAttribute("class", "active-user");
   });
}

function createUserItemContainer(user) {
   const name = user.name;
   const socketId = user.socketId;
   const ip = user.ip;
   const localName = localStorage.userName;

   const userContainerEl = document.createElement("div");

   const usernameEl = document.createElement("p");

   userContainerEl.setAttribute("class", "active-user");
   userContainerEl.setAttribute("id", socketId);
   usernameEl.setAttribute("class", "username");
   usernameEl.innerHTML = `${name}: ${localName === name ? "<b>(You)</b>" : ""} </br> ${socketId} </br> ${ip}`;

   userContainerEl.appendChild(usernameEl);

   userContainerEl.addEventListener("click", () => {
      unselectUsersFromList();
      userContainerEl.setAttribute("class", "active-user active-user--selected");
      const talkingWithInfo = document.getElementById("talking-with-info");
      talkingWithInfo.innerHTML = `Talking with: "Socket: ${socketId}"`;
      callUser(socketId);
   });
   return userContainerEl;
}

const { RTCPeerConnection, RTCSessionDescription } = window;

const peerConnection = new RTCPeerConnection({ iceTransportPolicy: "relay" });

async function callUser(socketId) {
   const offer = await peerConnection.createOffer();
   await peerConnection.setLocalDescription(new RTCSessionDescription(offer));

   socket.emit("call-user", {
      offer,
      to: socketId,
   });
}

socket.on("call-made", async (data) => {
   await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
   const answer = await peerConnection.createAnswer();
   await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

   socket.emit("make-answer", {
      answer,
      to: data.socket,
   });
});

socket.on("answer-made", async (data) => {
   await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

   if (!isAlreadyCalling) {
      callUser(data.socket);
      isAlreadyCalling = true;
   }
});

peerConnection.ontrack = function ({ streams: [stream] }) {
   const remoteVideo = document.getElementById("remote-video");
   if (remoteVideo) {
      remoteVideo.srcObject = stream;
   }
};
