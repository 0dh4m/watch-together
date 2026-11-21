/**
 * Multi-Language Internationalization (i18n) Engine
 * Supported Languages:
 * - English (en)
 * - Moroccan Darija / الدارجة المغربية (ar_ma)
 * - Modern Standard Arabic / العربية (ar)
 * - French / Français (fr)
 */

class I18nManager {
  constructor() {
    this.currentLang = localStorage.getItem('wt_lang') || 'en';
    this.translations = {
      en: {
        app_title: "Watch Together",
        app_tagline: "Real-Time Cinema & Voice",
        hero_tag: "Ultra-Low Latency Synchronization & Voice",
        hero_title_1: "Watch Movies Together",
        hero_title_2: "In Perfect Synchronization",
        hero_desc: "Stream YouTube, direct links, HLS broadcasts, or your own local movie files with friends. Zero lag, WebRTC voice chat, and live floating reactions.",
        display_name: "Your Display Nickname",
        create_room: "Create a Room",
        create_room_desc: "Launch a new synchronized cinema room and invite your friends with a 1-click link.",
        room_title: "Room Title",
        control_mode: "Control Mode",
        mode_collaborative: "Collaborative (Everyone can play/pause)",
        mode_host_only: "Host-Only Controls (Only host controls playback)",
        password_protect: "Password Protected (Private)",
        create_btn: "Create & Launch Room",
        join_by_code: "Join by Room Code",
        join_desc: "Have a 6-character room invite code from a friend? Enter it below to jump right in.",
        join_btn: "Join",
        watch_history: "Recent Watch History",
        live_lounges: "Live Public Lounges",
        live_lounges_desc: "Jump into active public screening rooms hosted by the community.",
        refresh: "Refresh",
        now_playing: "Now Playing",
        reactions: "Reactions:",
        floating_overlays: "Floating Overlays",
        change_video: "Change Video",
        tab_chat: "Chat",
        tab_queue: "Queue",
        tab_voice: "Voice & Friends",
        type_message: "Type a message... (Press Enter)",
        up_next: "Up Next in Room",
        drag_reorder: "Drag to reorder playlist queue",
        add_video: "Add Video",
        voice_channel: "Voice Channel",
        join_voice: "Join Voice Room",
        leave_voice: "Leave Voice",
        mute: "Mute",
        unmute: "Unmute",
        push_to_talk: "Push-to-Talk",
        ptt_hint: "Press & Hold SPACEBAR to Speak",
        participants: "Participants",
        theater_mode: "Theater Mode",
        fullscreen: "Fullscreen",
        share_timestamp: "Share Time",
        subtitles_btn: "Subtitles",
        create_poll_btn: "Live Poll",
        screen_share_btn: "Share Screen",
        ambilight_toggle: "Ambilight Glow",
        tab_platforms: "Top Platforms",
        tab_embed: "Web Embeds",
        tab_catalog: "Free Movies"
      },
      ar_ma: {
        app_title: "تفرجو مجموعين",
        app_tagline: "سينما متزامنة وشات صوتي لايف",
        hero_tag: "تزامن فوري وبدون أي روطار مع صوت واضح",
        hero_title_1: "تفرجو ف الأفلام مجموعين",
        hero_title_2: "بنفس الثانية وبدقة عالية",
        hero_desc: "تفرجو ف يوتيوب، روابط مباشرة، قنوات وبثوث HLS، ولا حتى أفلام مسجلة فبيسياتكم بلا ما ترفعو والو. ضحكو، هضرو بالصوت وتفاعلو مع صحابكم لايف.",
        display_name: "سميتك ف الروم",
        create_room: "فتح صالون جديد",
        create_room_desc: "صاوب روم سينما متزامنة وسيفط الرابط لصحابك يدخلو بنقرة وحدة.",
        room_title: "سمية الروم",
        control_mode: "طريقة التحكم",
        mode_collaborative: "تشاركي (كلشي يقدر يحبس ويخدم)",
        mode_host_only: "مول الروم فقط (غير الهوست لي كيتحكم)",
        password_protect: "روم خاص بمودباس (Private)",
        create_btn: "لونصي الروم دابا",
        join_by_code: "دخل بكود الروم",
        join_desc: "عندك كود فيه 6 د الحروف سيفطو ليك صاحبك؟ كتبو هنا ودخل ديريكت.",
        join_btn: "دخل",
        watch_history: "آخر ما تفرجتي فيه",
        live_lounges: "صالات مفتوحة دابا",
        live_lounges_desc: "دخل لصالونات عمومية طالقة أفلام وفيديوهات وتفرج مع ناس آخرين.",
        refresh: "تحديث",
        now_playing: "كيخدم دابا",
        reactions: "تفاعلات:",
        floating_overlays: "تفاعلات طايرة ف الشاشة",
        change_video: "بدل الفيديو",
        tab_chat: "الشات",
        tab_queue: "الليستة (Queue)",
        tab_voice: "الصوت والصحاب",
        type_message: "كتب ميساج... (ورك على Enter)",
        up_next: "الفيديوهات الجاية",
        drag_reorder: "جر ورتب الليستة كيف بغيتي",
        add_video: "زيد فيديو",
        voice_channel: "شات صوتي",
        join_voice: "دخل للصوت",
        leave_voice: "خرج من الصوت",
        mute: "ميتي المايك",
        unmute: "طلق المايك",
        push_to_talk: "ورك باش تهضر (PTT)",
        ptt_hint: "ورك وبقا شاد Espace باش تهضر",
        participants: "لي حاضرين ف الروم",
        theater_mode: "وضع السينما",
        fullscreen: "شاشة كاملة",
        share_timestamp: "شارك التوقيت",
        subtitles_btn: "الترجمة",
        create_poll_btn: "سوندابج لايف",
        screen_share_btn: "بارطاجي الشاشة",
        ambilight_toggle: "إضاءة السينما (Ambilight)",
        tab_platforms: "منصات الأفلام (Netflix/Prime)",
        tab_embed: "سيتات وفيديوهات الويب",
        tab_catalog: "أفلام مجانية واجدة"
      },
      ar: {
        app_title: "مشاهدة جماعية",
        app_tagline: "سينما متزامنة ومحادثة صوتية",
        hero_tag: "مزامنة فائقة السرعة بدون تأخير مع محادثة صوتية",
        hero_title_1: "شاهدوا الأفلام معاً",
        hero_title_2: "بتزامن مثالي وفوري",
        hero_desc: "شاهد يوتيوب، الروابط المباشرة، بثوث HLS، أو ملفات الفيديو المحلية المخزنة على أجهزتكم بدون أي رفع للإنترنت. تحدث بالصوت وتفاعل مباشرة.",
        display_name: "اسمك المستعار",
        create_room: "إنشاء غرفة جديدة",
        create_room_desc: "أطلق صالة سينما متزامنة وشارك الرابط مع أصدقائك بنقرة واحدة.",
        room_title: "عنوان الغرفة",
        control_mode: "وضع التحكم بالتشغيل",
        mode_collaborative: "تشاركي (الجميع يمكنهم التشغيل والإيقاف)",
        mode_host_only: "المضيف فقط (المضيف يتحكم حصرياً)",
        password_protect: "غرفة محمية بكلمة مرور (خاصة)",
        create_btn: "إنشاء وإطلاق الغرفة",
        join_by_code: "الانضمام برمز الغرفة",
        join_desc: "لديك رمز غرفة مكون من 6 أحرف؟ أدخله هنا للانضمام مباشرة.",
        join_btn: "انضمام",
        watch_history: "سجل المشاهدات الأخيرة",
        live_lounges: "الصالات العامة المباشرة",
        live_lounges_desc: "انضم إلى صالات عامة نشطة يشاهد فيها المجتمع مقاطع ممتعة.",
        refresh: "تحديث",
        now_playing: "يتم تشغيله الآن",
        reactions: "التفاعلات:",
        floating_overlays: "تفاعلات طافية على الشاشة",
        change_video: "تغيير الفيديو",
        tab_chat: "المحادثة",
        tab_queue: "قائمة الانتظار",
        tab_voice: "الصوت والأصدقاء",
        type_message: "اكتب رسالة... (اضغط Enter)",
        up_next: "التالي في القائمة",
        drag_reorder: "اسحب لإعادة ترتيب قائمة الانتظار",
        add_video: "إضافة فيديو",
        voice_channel: "القناة الصوتية",
        join_voice: "انضم للمحادثة الصوتية",
        leave_voice: "مغادرة الصوت",
        mute: "كتم المايك",
        unmute: "تشغيل المايك",
        push_to_talk: "اضغط للتحدث",
        ptt_hint: "اضغط واستمر بالضغط على المسافة (Space) للتحدث",
        participants: "المشاركون في الغرفة",
        theater_mode: "وضع المسرح",
        fullscreen: "ملء الشاشة",
        share_timestamp: "مشاركة التوقيت",
        subtitles_btn: "الترجمة",
        create_poll_btn: "تصويت مباشر",
        screen_share_btn: "مشاركة الشاشة",
        ambilight_toggle: "إضاءة سينمائية محيطية",
        tab_platforms: "منصات الأفلام والمسلسلات",
        tab_embed: "تضمين روابط الويب",
        tab_catalog: "أفلام مجانية جاهزة"
      },
      fr: {
        app_title: "Watch Together",
        app_tagline: "Cinéma Synchronisé & Chat Vocal",
        hero_tag: "Synchronisation ultra-rapide et chat vocal en direct",
        hero_title_1: "Regardez des Films Ensemble",
        hero_title_2: "En Parfaite Synchronisation",
        hero_desc: "Diffusez YouTube, liens directs, flux HLS ou vos propres fichiers vidéo locaux sans téléchargement. Chat vocal WebRTC et réactions animées en direct.",
        display_name: "Votre Pseudo",
        create_room: "Créer un Salon",
        create_room_desc: "Lancez un salon de cinéma synchronisé et invitez vos amis en 1 clic.",
        room_title: "Titre du Salon",
        control_mode: "Mode de Contrôle",
        mode_collaborative: "Collaboratif (Tout le monde peut contrôler)",
        mode_host_only: "Hôte uniquement (Seul l'hôte contrôle la lecture)",
        password_protect: "Protégé par mot de passe (Privé)",
        create_btn: "Créer et Lancer",
        join_by_code: "Rejoindre via Code",
        join_desc: "Vous avez un code à 6 caractères ? Saisissez-le ci-dessous pour rejoindre directement.",
        join_btn: "Rejoindre",
        watch_history: "Historique Récent",
        live_lounges: "Salons Publics en Direct",
        live_lounges_desc: "Rejoignez des salons publics animés par la communauté.",
        refresh: "Actualiser",
        now_playing: "En cours de lecture",
        reactions: "Réactions :",
        floating_overlays: "Réactions flottantes à l'écran",
        change_video: "Changer de Vidéo",
        tab_chat: "Chat",
        tab_queue: "File d'attente",
        tab_voice: "Voix & Amis",
        type_message: "Écrivez un message... (Appuyez sur Entrée)",
        up_next: "À Suivre",
        drag_reorder: "Glissez pour réorganiser la liste",
        add_video: "Ajouter une Vidéo",
        voice_channel: "Canal Vocal",
        join_voice: "Rejoindre le Vocal",
        leave_voice: "Quitter le Vocal",
        mute: "Couper Micro",
        unmute: "Activer Micro",
        push_to_talk: "Appuyer pour Parler",
        ptt_hint: "Maintenez ESPACE pour parler",
        participants: "Participants",
        theater_mode: "Mode Cinéma",
        fullscreen: "Plein Écran",
        share_timestamp: "Partager l'Heure",
        subtitles_btn: "Sous-titres",
        create_poll_btn: "Sondage en Direct",
        screen_share_btn: "Partager l'Écran",
        ambilight_toggle: "Éclairage Ambilight",
        tab_platforms: "Plateformes de Streaming",
        tab_embed: "Intégrations Web",
        tab_catalog: "Films Gratuits"
      }
    };
  }

  t(key) {
    const dict = this.translations[this.currentLang] || this.translations['en'];
    return dict[key] || this.translations['en'][key] || key;
  }

  setLanguage(lang) {
    if (!this.translations[lang]) return;
    this.currentLang = lang;
    localStorage.setItem('wt_lang', lang);

    // Set document direction for Arabic
    if (lang === 'ar' || lang === 'ar_ma') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }

    this.applyTranslations();

    if (window.ui) {
      window.ui.showToast(lang === 'ar_ma' ? 'تم تفعيل الدارجة المغربية 🇲🇦' : `Language updated: ${lang.toUpperCase()}`, 'info');
    }
  }

  applyTranslations() {
    // Elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });

    // Elements with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });

    // Elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });

    // Language selector dropdown value
    const select = document.getElementById('lang-select');
    if (select) select.value = this.currentLang;
  }
}

window.i18n = new I18nManager();
