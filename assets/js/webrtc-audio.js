export class WebRTCAudioCall {
  constructor({ callId, localSignalId, remoteSignalId, onState, onRemoteStream, sendSignal }) {
    this.callId = callId;
    this.localSignalId = localSignalId;
    this.remoteSignalId = remoteSignalId;
    this.onState = onState;
    this.onRemoteStream = onRemoteStream;
    this.sendSignal = sendSignal;
    this.pc = null;
    this.localStream = null;
  }

  async startAsCaller() {
    this.onState('calling');
    await this._ensureLocalMedia();
    this.pc = this._createPeerConnection();

    this.localStream.getTracks().forEach(track => {
      this.pc.addTrack(track, this.localStream);
    });

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.sendSignal('webrtc_offer', { offer });
  }

  async handleOffer(offer) {
    this.onState('connecting');
    await this._ensureLocalMedia();
    this.pc = this._createPeerConnection();

    this.localStream.getTracks().forEach(track => {
      this.pc.addTrack(track, this.localStream);
    });

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.sendSignal('webrtc_answer', { answer });
  }

  async handleAnswer(answer) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate) {
    if (!this.pc || !candidate) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('ICE candidate error', err);
    }
  }

  async _ensureLocalMedia() {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
    }
  }

  _createPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.sendSignal('ice_candidate', {
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') this.onState('connected');
      if (state === 'failed') this.onState('failed');
      if (state === 'disconnected' || state === 'closed') this.onState('ended');
    };
    return pc;
  }

  async end() {
    this.onState('ended');
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}
