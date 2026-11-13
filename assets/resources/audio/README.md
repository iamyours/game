五段原创合成PCM单声道WAV：shot离弦、hit干脆轻撞、hit-heavy低频重撞、hit-critical短撞与清亮暴击音、drop装备脱落。Python数学振荡+固定随机噪声生成，无第三方素材或语音。D037移除有机受创感，普通/重击/头部暴击分档；新增两段meta由Creator真实导入生成。未做真实引擎、宿主或真机音频验收。

D040新增music-storm/frost/ember/boss四首原创立体声OGG循环音乐，16小节，88/76/96/112BPM。由scripts/generate-music.py以音符、和弦、鼓和循环反射生成；无第三方采样。music-manifest.json保存时长、峰值与哈希；check-expedition-assets.py实际解码验证。首触发声、双通道渐变，独立音乐设置；实际Creator/Android/微信播放与听感待验。新增meta由真实Creator导入生成。
