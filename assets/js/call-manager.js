/**
 * Signal Phone — Unified WebRTC Call Manager
 * Handles audio/video calls with Matrix VoIP or Server-DM signaling.
 */

export class CallManager {
  constructor({ onStateChange, onRemoteStream, localName }) {
    this.pc = null
    this.localStream = null
    this.remoteStream = null
    this.state = 'idle' // idle|dialing|ringing|connecting|connected|failed|ended
    this.callId = null
    this.isVideo = false
    this.isMuted = false
    this.isSpeaker = false
    this.timerInterval = null
    this.elapsed = 0
    this.remoteName = ''
    this.localName = localName || ''
    this.onStateChange = onStateChange || (() => {})
    this.onRemoteStream = onRemoteStream || (() => {})
    this._signalCallback = null
    this._pendingCandidates = []
  }

  setSignalCallback(fn) {
    this._signalCallback = fn
  }

  async startCall(remoteName, isVideo = false) {
    if (this.state !== 'idle') return
    this.remoteName = remoteName
    this.isVideo = isVideo
    this.callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.state = 'dialing'
    this.onStateChange('dialing', { callId: this.callId, remoteName })
    await this._ensureLocalMedia()
    this.pc = this._createPeerConnection()
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream))
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    await this._sendSignal('webrtc_offer', { offer, callId: this.callId })
  }

  async handleIncoming(offer, callId, remoteName) {
    this.remoteName = remoteName
    this.callId = callId
    this._pendingOffer = offer
    this.state = 'ringing'
    this.onStateChange('ringing', { callId, remoteName })
  }

  async acceptCall(isVideo = false) {
    this.isVideo = isVideo
    this.state = 'connecting'
    this.onStateChange('connecting', { callId: this.callId, remoteName: this.remoteName })
    await this._ensureLocalMedia()
    this.pc = this._createPeerConnection()
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream))
    await this.pc.setRemoteDescription(new RTCSessionDescription(this._pendingOffer))
    await this._flushPendingCandidates()
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    await this._sendSignal('webrtc_answer', { answer, callId: this.callId })
    this._startTimer()
    this.state = 'connected'
    this.onStateChange('connected', { callId: this.callId, remoteName: this.remoteName })
  }

  declineCall() {
    this._sendSignal('webrtc_hangup', { callId: this.callId })
    this._cleanup()
    this.state = 'idle'
    this.onStateChange('idle', {})
  }

  async handleOffer(data) {
    this._pendingOffer = data.offer
    this.callId = data.callId
    this.state = 'ringing'
    this.onStateChange('ringing', { callId: this.callId, remoteName: this.remoteName })
  }

  async handleAnswer(data) {
    if (!this.pc) return
    await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer))
    await this._flushPendingCandidates()
    this._startTimer()
    this.state = 'connected'
    this.onStateChange('connected', { callId: this.callId, remoteName: this.remoteName })
  }

  async handleIceCandidate(data) {
    if (!data.candidate) return
    if (!this.pc || !this.pc.remoteDescription) {
      this._pendingCandidates.push(data.candidate)
      return
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (e) {
      // ignore
    }
  }

  async _flushPendingCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return
    const candidates = this._pendingCandidates.splice(0)
    for (const candidate of candidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {}
    }
  }

  handleHangup() {
    this._cleanup()
    this.state = 'idle'
    this.onStateChange('idle', {})
  }

  toggleMute() {
    this.isMuted = !this.isMuted
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = !this.isMuted })
    }
    this.onStateChange(this.state, { muted: this.isMuted })
  }

  toggleSpeaker() {
    this.isSpeaker = !this.isSpeaker
    this.onStateChange(this.state, { speaker: this.isSpeaker })
  }

  toggleVideo() {
    if (!this.isVideo) {
      this._addVideo()
    } else {
      this._removeVideo()
    }
    this.isVideo = !this.isVideo
    this.onStateChange(this.state, { video: this.isVideo })
  }

  async end() {
    this._sendSignal('webrtc_hangup', { callId: this.callId })
    this._cleanup()
    this.state = 'idle'
    this.onStateChange('idle', {})
  }

  _createPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    })
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendSignal('ice_candidate', {
          candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate,
          callId: this.callId
        })
      }
    }
    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        this.remoteStream = e.streams[0]
        this.onRemoteStream(e.streams[0])
      }
    }
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'failed') { this.state = 'failed'; this.onStateChange('failed', {}); this._cleanup() }
      if (s === 'disconnected' || s === 'closed') { this.handleHangup() }
    }
    return pc
  }

  async _ensureLocalMedia() {
    if (this.localStream) return
    const constraints = { audio: true, video: this.isVideo }
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
  }

  async _addVideo() {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      videoStream.getVideoTracks().forEach(t => {
        this.localStream.addTrack(t)
        if (this.pc) {
          this.pc.addTrack(t, this.localStream)
        }
      })
    } catch (e) {
      // camera not available
    }
  }

  _removeVideo() {
    if (!this.localStream) return
    this.localStream.getVideoTracks().forEach(t => {
      t.stop()
      this.localStream.removeTrack(t)
    })
  }

  async _sendSignal(type, data) {
    if (this._signalCallback) {
      await this._signalCallback(type, data)
    }
  }

  _startTimer() {
    this.elapsed = 0
    clearInterval(this.timerInterval)
    this.timerInterval = setInterval(() => {
      this.elapsed++
      this.onStateChange(this.state, { elapsed: this.elapsed })
    }, 1000)
  }

  _cleanup() {
    clearInterval(this.timerInterval)
    this.timerInterval = null
    this.elapsed = 0
    this._pendingOffer = null
    this._pendingCandidates = []
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop())
      this.localStream = null
    }
    this.remoteStream = null
  }

  formatTime(secs) {
    if (secs == null) secs = this.elapsed
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
}
