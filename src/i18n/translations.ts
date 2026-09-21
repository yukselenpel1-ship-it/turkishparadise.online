export type Language = 'tr' | 'en';

export interface TranslationDictionary {
  // Navigation & Branding
  brandName: string;
  betaBadge: string;
  tagline: string;
  home: string;
  howToPlay: string;
  features: string;
  community: string;
  contact: string;
  soundOn: string;
  soundOff: string;
  theme: string;
  language: string;

  // Lobby & Hero
  heroBadge: string;
  heroTitle1: string;
  heroTitle2: string;
  heroTitleHighlight: string;
  heroDescription: string;
  quoteBottomLeft: string;
  quoteTopRight: string;
  strategyBadge: string;
  conquerBadge: string;
  investBadge: string;
  friendsBadge: string;

  // Lobby Actions & Room Form
  roomLobbyTitle: string;
  roomCodeLabel: string;
  copyRoomCode: string;
  copyRoomLink: string;
  copied: string;
  copy: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  roomSettingsTitle: string;
  startMoneyLabel: string;
  maxHousesLabel: string;
  unlimitedHouses: string;
  housesCount: string;
  botDifficultyLabel: string;
  botEasy: string;
  botMedium: string;
  botHard: string;
  playersListTitle: string;
  addEasyBot: string;
  addMediumBot: string;
  addHardBot: string;
  hostBadge: string;
  youBadge: string;
  removeBot: string;
  kickPlayer: string;
  leaveLobby: string;
  startGame: string;
  waitingForHost: string;
  minPlayersRequired: string;
  selectAvatarLabel: string;
  selectColorLabel: string;
  colorTaken: string;
  createAndJoinRoom: string;
  playAsGuest: string;
  joinFriend: string;
  googleLogin: string;
  googleLogout: string;
  guestLoginTitle: string;
  guestNameLabel: string;
  guestPlayBtn: string;
  joinFriendTitle: string;
  targetRoomCodeLabel: string;
  joinRoomBtn: string;
  backToMenu: string;

  // In-Game Header & Status
  liveBadge: string;
  roomCodeDisplay: string;
  profileAndStats: string;
  newFriendRequestsAlert: string;
  restartGame: string;
  restartTooltip: string;

  // Board & Center Controls
  turnOf: string;
  turnCountdownTooltip: string;
  afkBotAlert: string;
  takeBackControl: string;
  rollDice: string;
  rollingDice: string;
  endTurn: string;
  jailedAlert: string;
  payBailBtn: string;
  evaluatingProperty: string;
  buyBtn: string;
  passBtn: string;
  tradeBtn: string;
  propertiesBtn: string;
  ledgerBtn: string;

  // Property Modal
  salePrice: string;
  notForSale: string;
  ownerLabel: string;
  unownedBank: string;
  seriesRequiredTitle: string;
  ownedCount: string;
  rentScheduleTitle: string;
  baseRent: string;
  with1House: string;
  with2Houses: string;
  with3Houses: string;
  with4Houses: string;
  withHotel: string;
  stationRentNote: string;
  stationOwnedRent: string;
  houseBuildCost: string;
  mortgageValue: string;
  isMortgagedBadge: string;
  buildHouseBtn: string;
  sellHouseBtn: string;
  mortgageBtn: string;
  unmortgageBtn: string;
  sellToBankBtn: string;
  proposeTradeBtn: string;
  buyPropertyBtn: string;
  passPropertyBtn: string;
  closeBtn: string;

  // My Properties Modal
  myPropertiesTitle: string;
  noPropertiesOwned: string;
  housesCountBadge: string;
  hotelBadge: string;
  mortgagedTag: string;

  // Trade Modal
  tradeTitle: string;
  tradeWithLabel: string;
  myOfferedProperties: string;
  myOfferedMoney: string;
  theirRequestedProperties: string;
  theirRequestedMoney: string;
  sendOfferBtn: string;
  noPropertiesToTrade: string;
  incomingTradeTitle: string;
  incomingTradeSubtitle: string;
  acceptTradeBtn: string;
  declineTradeBtn: string;
  waitingForTradeResponse: string;

  // Transactions Ledger Modal
  ledgerTitle: string;
  ledgerSubtitle: string;
  allTransactions: string;
  myTransactionsOnly: string;
  incomesOnly: string;
  expensesOnly: string;
  searchPlaceholder: string;
  allPlayersOption: string;
  noTransactionsFound: string;
  totalRecords: string;
  categoryBuy: string;
  categoryRentIn: string;
  categoryRentOut: string;
  categorySalary: string;
  categoryBankSell: string;
  categoryTrade: string;
  categoryTax: string;
  categoryBail: string;
  categoryChance: string;
  categoryBuildHouse: string;
  categoryMortgage: string;

  // Winner Modal
  congratsWon: string;
  gameOver: string;
  wonDescription: string;
  gameOverDescription: string;
  championWithBalance: string;
  playAgainBtn: string;
  viewStatsBtn: string;

  // Profile & Social Modal
  profileTitle: string;
  tabStats: string;
  tabFriends: string;
  tabRequests: string;
  tabAddFriend: string;
  friendCodeLabel: string;
  copyFriendCode: string;
  gamesWonStat: string;
  gamesPlayedStat: string;
  netWorthStat: string;
  friendsOnline: string;
  noFriendsYet: string;
  noPendingRequests: string;
  enterFriendCodePlaceholder: string;
  sendFriendRequestBtn: string;
  inviteFriendToRoom: string;
  acceptRequest: string;
  rejectRequest: string;

  // Contact Modal
  contactTitle: string;
  contactSubtitle: string;
  contactDescription: string;
  officialEmailLabel: string;
  openInEmailApp: string;
  suggestionsTag: string;
  suggestionsDesc: string;
  bugReportTag: string;
  bugReportDesc: string;
  collabTag: string;
  collabDesc: string;

  // Info Modals (Rules, Features, Community)
  rulesModalTitle: string;
  featuresModalTitle: string;
  communityModalTitle: string;

  // Sidebars
  playerListHeader: string;
  playersCountBadge: string;
  chatHeader: string;
  chatPlaceholder: string;
  chatDisabledPlaceholder: string;
  logsHeader: string;
  afkBadge: string;
  jailedBadge: string;
  propertyCount: string;

  // Debt Settlement & Bankruptcy Recovery
  debtSettlementTitle: string;
  debtSettlementInstruction: string;
  debtSettlementWaiting: string;
  managePropertiesBtn: string;
  tradeForCashBtn: string;
  surrenderBankruptcyBtn: string;

  // Spectator Mode
  spectatorBadge: string;
  bankruptBadge: string;
  spectatorBanner: string;
  spectatorMode: string;

  // Public Rooms
  publicRoomsBtn: string;
  publicRoomsTitle: string;
  shareRoomPublicly: string;
  roomPublishedNotice: string;

  // Common
  currencySymbol: string;
  loginBtn: string;
  mobilePlayersTab: string;
  mobileChatTab: string;
  mobileLogsTab: string;
  mobilePlayerStatus: string;
  mobileGameChat: string;
  mobileLogsAlerts: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  tr: {
    // Navigation & Branding
    brandName: 'Turkish Paradise',
    betaBadge: 'BETA',
    tagline: 'TURKISH PARADISE • Strateji • Ticaret • Eğlence • Türkiye',
    home: 'Ana Sayfa',
    howToPlay: 'Nasıl Oynanır?',
    features: 'Özellikler',
    community: 'Topluluk',
    contact: 'İletişim',
    soundOn: 'Ses Açık',
    soundOff: 'Sessiz',
    theme: 'Tema',
    language: 'Dil',

    // Lobby & Hero
    heroBadge: 'Çevrimiçi Çok Oyunculu & Arkadaş Odaları',
    heroTitle1: 'Türkiye',
    heroTitle2: 'Senin',
    heroTitleHighlight: 'Oyun Alanın',
    heroDescription: 'Şehirleri al, yatırımlarını büyüt, rakiplerini geride bırak. Strateji, ticaret ve eğlence bir arada!',
    quoteBottomLeft: '"Bu topraklarda her şehir bir hikaye..."',
    quoteTopRight: 'Daha fazla şehir,\ndaha fazla fırsat.',
    strategyBadge: 'Strateji Kur',
    conquerBadge: 'Şehirleri Fethet',
    investBadge: 'Yatırımını Büyüt',
    friendsBadge: 'Arkadaşlarınla Oyna',

    // Lobby Actions & Room Form
    roomLobbyTitle: 'Oda Lobisi',
    roomCodeLabel: 'Oda Kodu',
    copyRoomCode: 'Oda Kodunu Kopyala',
    copyRoomLink: 'Davet Linkini Kopyala',
    copied: 'Kopyalandı',
    copy: 'Kopyala',
    usernameLabel: 'Oyuncu Adı',
    usernamePlaceholder: 'Adınızı girin...',
    roomSettingsTitle: 'Oda Ayarları',
    startMoneyLabel: 'Başlangıç Parası',
    maxHousesLabel: 'Maksimum Ev Sayısı',
    unlimitedHouses: 'Sınırsız (Klasik)',
    housesCount: '{count} Adet Yer',
    botDifficultyLabel: 'Bot Zorluğu',
    botEasy: '🟢 Kolay Bot',
    botMedium: '🟡 Orta Bot',
    botHard: '🔴 Zor Bot',
    playersListTitle: 'Oyuncular',
    addEasyBot: '+ Kolay',
    addMediumBot: '+ Orta',
    addHardBot: '+ Zor',
    hostBadge: 'Kurucu',
    youBadge: 'SİZ',
    removeBot: 'Botu Odadan Sil',
    kickPlayer: 'Oyuncuyu Odadan Çıkar',
    leaveLobby: 'Lobiden Ayrıl',
    startGame: 'Oyunu Başlat',
    waitingForHost: 'Kurucunun oyunu başlatması bekleniyor...',
    minPlayersRequired: 'Oyunu başlatmak için en az 2 oyuncu veya bot gereklidir.',
    selectAvatarLabel: 'Karakter / Avatar Seçimi',
    selectColorLabel: 'Piyon Rengi',
    colorTaken: 'DOLU',
    createAndJoinRoom: 'Oda Kur & Oyuna Gir',
    playAsGuest: 'Misafir Oyna',
    joinFriend: 'Arkadaşına Katıl',
    googleLogin: 'Google ile Giriş Yap',
    googleLogout: 'Çıkış Yap',
    guestLoginTitle: 'Misafir Girişi',
    guestNameLabel: 'Misafir Oyuncu Adı',
    guestPlayBtn: 'Misafir Olarak Başla',
    joinFriendTitle: 'Arkadaş Odasına Katıl',
    targetRoomCodeLabel: 'Katılmak İstediğiniz Oda Kodu',
    joinRoomBtn: 'Odaya Bağlan',
    backToMenu: 'Menüye Dön',

    // In-Game Header & Status
    liveBadge: 'Canlı',
    roomCodeDisplay: 'Oda: {code}',
    profileAndStats: 'Profil & İstatistikleri Gör',
    newFriendRequestsAlert: '{count} yeni arkadaşlık isteği!',
    restartGame: 'Yeniden',
    restartTooltip: 'Oyunu Yeniden Başlat / Lobiye Dön',

    // Board & Center Controls
    turnOf: 'Sıra: {name}',
    turnCountdownTooltip: 'Tur Süresi (60sn sonra bot devralır)',
    afkBotAlert: '🤖 AFK Modu (Bot Oynuyor)',
    takeBackControl: '🎮 KONTROLÜ GERİ AL',
    rollDice: 'ZAR AT',
    rollingDice: 'ZAR ATILIYOR...',
    endTurn: 'TURU BİTİR',
    jailedAlert: '🔒 Kodestesiniz! (Kalan: {turns}/3)',
    payBailBtn: '100₺ Kefalet Öde',
    evaluatingProperty: '🎲 {name} bu mülkü satın almayı değerlendiriyor...',
    buyBtn: 'AL 💰',
    passBtn: 'PAS ⏩',
    tradeBtn: 'Takas',
    propertiesBtn: 'Mülkler',
    ledgerBtn: 'Hesap',

    // Property Modal
    salePrice: 'Satış Fiyatı',
    notForSale: 'Satılamaz',
    ownerLabel: 'Sahibi',
    unownedBank: 'Sahipsiz (Banka)',
    seriesRequiredTitle: 'Ev Dikmek İçin Gereken Şehirler',
    ownedCount: '{owned}/{total} Sahip',
    rentScheduleTitle: 'Kira ve Gelir Tarifesi',
    baseRent: 'Boş Arsa Kirası',
    with1House: '1 Ev ile Kira',
    with2Houses: '2 Ev ile Kira',
    with3Houses: '3 Ev ile Kira',
    with4Houses: '4 Ev ile Kira',
    withHotel: 'Otel (5 Ev) ile Kira',
    stationRentNote: 'Sahip olunan iskele sayısına göre kira katlanır:',
    stationOwnedRent: '{count} İskele Sahibi',
    houseBuildCost: 'Ev / Otel Dikim Bedeli',
    mortgageValue: 'İpotek Değeri',
    isMortgagedBadge: '⚠️ BU MÜLK İPOTEKLİDİR (Kira Getirmez)',
    buildHouseBtn: 'Ev İnşa Et (+₺{cost})',
    sellHouseBtn: 'Ev Sat (+₺{gain})',
    mortgageBtn: 'İpotek Et (+₺{amount})',
    unmortgageBtn: 'İpoteği Kaldır (-₺{amount})',
    sellToBankBtn: 'Bankaya Geri Sat (+₺{amount})',
    proposeTradeBtn: 'Takas Başlat',
    buyPropertyBtn: 'Satın Al (₺{price})',
    passPropertyBtn: 'Pas Geç',
    closeBtn: 'Kapat',

    // My Properties Modal
    myPropertiesTitle: 'Mülk Portföyü & Tapu Listesi',
    noPropertiesOwned: '{name} henüz herhangi bir şehre veya iskeleye sahip değil.',
    housesCountBadge: '{count} Ev',
    hotelBadge: 'Otel 🏨',
    mortgagedTag: 'İpotekli',

    // Trade Modal
    tradeTitle: 'Mülk ve Para Takası',
    tradeWithLabel: 'Takas Yapılacak Oyuncu',
    myOfferedProperties: 'Vereceğiniz Mülkler',
    myOfferedMoney: 'Vereceğiniz Para Tutarı (₺)',
    theirRequestedProperties: 'İstediğiniz Mülkler',
    theirRequestedMoney: 'İstediğiniz Para Tutarı (₺)',
    sendOfferBtn: 'Takas Teklifini Gönder',
    noPropertiesToTrade: 'Takasa sunulabilecek mülk bulunmuyor.',
    incomingTradeTitle: 'Takas Teklifi',
    incomingTradeSubtitle: 'Size bir mülk takas anlaşması öneriyor',
    acceptTradeBtn: 'Teklifi Kabul Et',
    declineTradeBtn: 'Reddet',
    waitingForTradeResponse: 'Karşı tarafın teklifi yanıtlaması bekleniyor...',

    // Transactions Ledger Modal
    ledgerTitle: 'Hesap & Para Hareketleri',
    ledgerSubtitle: 'Kira, alım, satış, takas ve maaş finansal kayıtları',
    allTransactions: 'Tüm Hareketler',
    myTransactionsOnly: 'Sadece Benim 👤',
    incomesOnly: 'Gelirler (+)',
    expensesOnly: 'Giderler (-)',
    searchPlaceholder: 'Açıklama veya kategori ara...',
    allPlayersOption: 'Tüm Oyuncular',
    noTransactionsFound: 'Henüz para hareketi bulunamadı.',
    totalRecords: 'Toplam Kayıt',
    categoryBuy: 'Mülk Alımı',
    categoryRentIn: 'Kira Geliri',
    categoryRentOut: 'Kira Gideri',
    categorySalary: 'Tur Maaşı',
    categoryBankSell: 'Banka Satışı',
    categoryTrade: 'Takas',
    categoryTax: 'Vergi',
    categoryBail: 'Kefalet',
    categoryChance: 'Şans / Kamu',
    categoryBuildHouse: 'Ev / Otel',
    categoryMortgage: 'İpotek',

    // Winner Modal
    congratsWon: '🎉 TEBRİKLER, KAZANDINIZ!',
    gameOver: '🏆 OYUN TAMAMLANDI!',
    wonDescription: 'Tüm rakiplerinizi eleyerek Turkish Paradise şampiyonu oldunuz!',
    gameOverDescription: 'Turkish Paradise Maç Sonucu',
    championWithBalance: '₺{amount} Bakiye ile Şampiyon!',
    playAgainBtn: 'Yeni Oyun Başlat',
    viewStatsBtn: 'Profil ve Zafer İstatistiklerimi Gör',

    // Profile & Social Modal
    profileTitle: 'Kullanıcı Profili & İstatistikler',
    tabStats: 'İstatistik',
    tabFriends: 'Arkadaşlar',
    tabRequests: 'İstekler',
    tabAddFriend: 'Ekle',
    friendCodeLabel: 'Özel Arkadaş Kodunuz',
    copyFriendCode: 'Kodu Kopyala',
    gamesWonStat: 'Kazanılan Maç',
    gamesPlayedStat: 'Oynanan Maç',
    netWorthStat: 'Toplam Servet',
    friendsOnline: 'Çevrimiçi Arkadaşlar',
    noFriendsYet: 'Henüz arkadaş listenizde kimse yok. Arkadaş kodunuzu paylaşarak ekleyin!',
    noPendingRequests: 'Bekleyen yeni arkadaşlık isteği yok.',
    enterFriendCodePlaceholder: 'Arkadaş Kodunu Girin (örn: TP-XXXXXX)',
    sendFriendRequestBtn: 'İstek Gönder',
    inviteFriendToRoom: 'Odaya Davet Et',
    acceptRequest: 'Kabul Et',
    rejectRequest: 'Reddet',

    // Contact Modal
    contactTitle: 'İletişim & Geri Bildirim',
    contactSubtitle: 'Bizimle iletişime geçin',
    contactDescription: 'Turkish Paradise ile ilgili her türlü soru, öneri, hata bildirimi (bug), yeni özellik isteği ve iş birliği için resmi e-posta adresimiz üzerinden bize doğrudan ulaşabilirsiniz.',
    officialEmailLabel: 'Resmi E-Posta Adresi',
    openInEmailApp: 'E-Posta Uygulamasında Aç',
    suggestionsTag: '💡 Öneriler',
    suggestionsDesc: 'Yeni fikir & istekler',
    bugReportTag: '🐛 Hata Bildirimi',
    bugReportDesc: "Gördüğünüz bug'lar",
    collabTag: '🤝 İş Birliği',
    collabDesc: 'Topluluk & sponsorluk',

    // Info Modals (Rules, Features, Community)
    rulesModalTitle: 'Nasıl Oynanır? (Oyun Kuralları)',
    featuresModalTitle: 'Turkish Paradise Özellikleri',
    communityModalTitle: 'Topluluk & Çok Oyunculu',

    // Sidebars
    playerListHeader: 'Oyuncular Durumu',
    playersCountBadge: '{count} Oyuncu',
    chatHeader: 'Oyun Sohbeti',
    chatPlaceholder: 'Mesaj yaz...',
    chatDisabledPlaceholder: 'Sohbet için oyuna katılın',
    logsHeader: 'Oyun Akışı & Bildirimler',
    afkBadge: 'AFK (BOT)',
    jailedBadge: 'KODESTE',
    propertyCount: '{count} Mülk',

    // Debt Settlement & Bankruptcy Recovery
    debtSettlementTitle: '⚠️ Borç Tasfiye ve Bakiye Kurtarma',
    debtSettlementInstruction: 'Bakiyeniz eksiye düştü! İflas etmemek için mülk satışı, ev satışı veya diğer oyuncularla nakit takası yapın.',
    debtSettlementWaiting: '🎲 {name} borcunu ödemek için mülklerini satıyor / takas yapıyor...',
    managePropertiesBtn: 'Mülk / Ev Sat & İpotek 🏠',
    tradeForCashBtn: 'Nakit İçin Takas Yap 🤝',
    surrenderBankruptcyBtn: 'İflasımı Açıkla (Çekil) 💀',

    // Spectator Mode
    spectatorBadge: 'İzleyici 👁️',
    bankruptBadge: 'İflas (İzleyici)',
    spectatorBanner: '👁️ İflas ettiniz ancak oyunu odada kalarak canlı izlemeye ve sohbet etmeye devam edebilirsiniz.',
    spectatorMode: 'İzleyici Modu',

    // Public Rooms
    publicRoomsBtn: '🌐 Canlı Odalar',
    publicRoomsTitle: 'Açık Canlı Odalar',
    shareRoomPublicly: 'Odayı Listede Paylaş 🌐',
    roomPublishedNotice: 'Oda canlı odalar listesinde yayınlandı!',

    // Common
    currencySymbol: '₺',
    loginBtn: 'Giriş Yap',
    mobilePlayersTab: 'Oyuncular ({count})',
    mobileChatTab: 'Sohbet',
    mobileLogsTab: 'Kayıtlar',
    mobilePlayerStatus: 'Oyuncu Durumu',
    mobileGameChat: 'Oyun Sohbeti',
    mobileLogsAlerts: 'Bildirimler & Kayıtlar',
  },
  en: {
    // Navigation & Branding
    brandName: 'Turkish Paradise',
    betaBadge: 'BETA',
    tagline: 'TURKISH PARADISE • Strategy • Trading • Fun • Turkey Board Game',
    home: 'Home',
    howToPlay: 'How to Play?',
    features: 'Features',
    community: 'Community',
    contact: 'Contact',
    soundOn: 'Sound On',
    soundOff: 'Muted',
    theme: 'Theme',
    language: 'Language',

    // Lobby & Hero
    heroBadge: 'Online Multiplayer & Friend Rooms',
    heroTitle1: 'Turkey',
    heroTitle2: 'Is Your',
    heroTitleHighlight: 'Playground',
    heroDescription: 'Acquire cities, grow your investments, and outplay your rivals. Strategy, trading, and endless fun together!',
    quoteBottomLeft: '"In these lands, every city tells a story..."',
    quoteTopRight: 'More cities,\nmore opportunities.',
    strategyBadge: 'Build Strategy',
    conquerBadge: 'Conquer Cities',
    investBadge: 'Grow Wealth',
    friendsBadge: 'Play with Friends',

    // Lobby Actions & Room Form
    roomLobbyTitle: 'Room Lobby',
    roomCodeLabel: 'Room Code',
    copyRoomCode: 'Copy Room Code',
    copyRoomLink: 'Copy Invite Link',
    copied: 'Copied',
    copy: 'Copy',
    usernameLabel: 'Player Name',
    usernamePlaceholder: 'Enter your name...',
    roomSettingsTitle: 'Room Settings',
    startMoneyLabel: 'Starting Cash',
    maxHousesLabel: 'Max Houses Limit',
    unlimitedHouses: 'Unlimited (Classic)',
    housesCount: '{count} Per Property',
    botDifficultyLabel: 'Bot Difficulty',
    botEasy: '🟢 Easy Bot',
    botMedium: '🟡 Medium Bot',
    botHard: '🔴 Hard Bot',
    playersListTitle: 'Players',
    addEasyBot: '+ Easy',
    addMediumBot: '+ Medium',
    addHardBot: '+ Hard',
    hostBadge: 'Host',
    youBadge: 'YOU',
    removeBot: 'Remove Bot',
    kickPlayer: 'Kick Player',
    leaveLobby: 'Leave Lobby',
    startGame: 'Start Game',
    waitingForHost: 'Waiting for room host to start the game...',
    minPlayersRequired: 'At least 2 players or bots are required to start.',
    selectAvatarLabel: 'Select Character / Avatar',
    selectColorLabel: 'Token Color',
    colorTaken: 'TAKEN',
    createAndJoinRoom: 'Create Room & Play',
    playAsGuest: 'Play as Guest',
    joinFriend: 'Join Friend',
    googleLogin: 'Sign in with Google',
    googleLogout: 'Sign Out',
    guestLoginTitle: 'Guest Login',
    guestNameLabel: 'Guest Name',
    guestPlayBtn: 'Play as Guest',
    joinFriendTitle: 'Join Friend Room',
    targetRoomCodeLabel: 'Room Code to Join',
    joinRoomBtn: 'Connect to Room',
    backToMenu: 'Back to Menu',

    // In-Game Header & Status
    liveBadge: 'Live',
    roomCodeDisplay: 'Room: {code}',
    profileAndStats: 'View Profile & Stats',
    newFriendRequestsAlert: '{count} new friend requests!',
    restartGame: 'Restart',
    restartTooltip: 'Restart Game / Return to Lobby',

    // Board & Center Controls
    turnOf: "Turn: {name}",
    turnCountdownTooltip: 'Turn timer (bot takes over after 60s)',
    afkBotAlert: '🤖 AFK Mode (Bot Playing)',
    takeBackControl: '🎮 TAKE BACK CONTROL',
    rollDice: 'ROLL DICE',
    rollingDice: 'ROLLING DICE...',
    endTurn: 'END TURN',
    jailedAlert: '🔒 In Jail! (Remaining: {turns}/3)',
    payBailBtn: 'Pay $100 Bail',
    evaluatingProperty: '🎲 {name} is deciding whether to buy this property...',
    buyBtn: 'BUY 💰',
    passBtn: 'PASS ⏩',
    tradeBtn: 'Trade',
    propertiesBtn: 'Properties',
    ledgerBtn: 'Ledger',

    // Property Modal
    salePrice: 'Purchase Price',
    notForSale: 'Not for Sale',
    ownerLabel: 'Owner',
    unownedBank: 'Unowned (Bank)',
    seriesRequiredTitle: 'Required Cities to Build Houses',
    ownedCount: '{owned}/{total} Owned',
    rentScheduleTitle: 'Rent & Income Rates',
    baseRent: 'Base Land Rent',
    with1House: 'Rent with 1 House',
    with2Houses: 'Rent with 2 Houses',
    with3Houses: 'Rent with 3 Houses',
    with4Houses: 'Rent with 4 Houses',
    withHotel: 'Rent with Hotel (5 Houses)',
    stationRentNote: 'Rent multiplies with number of stations owned:',
    stationOwnedRent: 'Owns {count} Stations',
    houseBuildCost: 'House / Hotel Cost',
    mortgageValue: 'Mortgage Value',
    isMortgagedBadge: '⚠️ THIS PROPERTY IS MORTGAGED (No Rent Collected)',
    buildHouseBtn: 'Build House (+${cost})',
    sellHouseBtn: 'Sell House (+${gain})',
    mortgageBtn: 'Mortgage (+${amount})',
    unmortgageBtn: 'Unmortgage (-${amount})',
    sellToBankBtn: 'Sell to Bank (+${amount})',
    proposeTradeBtn: 'Propose Trade',
    buyPropertyBtn: 'Buy (${price})',
    passPropertyBtn: 'Pass',
    closeBtn: 'Close',

    // My Properties Modal
    myPropertiesTitle: 'Property Portfolio & Deeds',
    noPropertiesOwned: '{name} does not own any properties or stations yet.',
    housesCountBadge: '{count} Houses',
    hotelBadge: 'Hotel 🏨',
    mortgagedTag: 'Mortgaged',

    // Trade Modal
    tradeTitle: 'Trade Properties & Cash',
    tradeWithLabel: 'Trading Partner',
    myOfferedProperties: 'Your Offered Properties',
    myOfferedMoney: 'Your Offered Money ($)',
    theirRequestedProperties: 'Requested Properties',
    theirRequestedMoney: 'Requested Money ($)',
    sendOfferBtn: 'Send Trade Offer',
    noPropertiesToTrade: 'No properties available for trade.',
    incomingTradeTitle: 'Incoming Trade Offer',
    incomingTradeSubtitle: 'is proposing a trade deal to you',
    acceptTradeBtn: 'Accept Offer',
    declineTradeBtn: 'Decline',
    waitingForTradeResponse: 'Waiting for partner to respond to trade offer...',

    // Transactions Ledger Modal
    ledgerTitle: 'Account & Financial Ledger',
    ledgerSubtitle: 'Rent, purchases, sales, trades, and salary history',
    allTransactions: 'All Records',
    myTransactionsOnly: 'Mine Only 👤',
    incomesOnly: 'Income (+)',
    expensesOnly: 'Expenses (-)',
    searchPlaceholder: 'Search description or category...',
    allPlayersOption: 'All Players',
    noTransactionsFound: 'No financial records found yet.',
    totalRecords: 'Total Records',
    categoryBuy: 'Property Purchase',
    categoryRentIn: 'Rent Received',
    categoryRentOut: 'Rent Paid',
    categorySalary: 'Pass GO Salary',
    categoryBankSell: 'Sold to Bank',
    categoryTrade: 'Trade Deal',
    categoryTax: 'Tax Payment',
    categoryBail: 'Jail Bail',
    categoryChance: 'Chance / Fund',
    categoryBuildHouse: 'House / Hotel',
    categoryMortgage: 'Mortgage',

    // Winner Modal
    congratsWon: '🎉 CONGRATULATIONS, YOU WON!',
    gameOver: '🏆 GAME OVER!',
    wonDescription: 'You eliminated all competitors to become the champion of Turkish Paradise!',
    gameOverDescription: 'Turkish Paradise Match Results',
    championWithBalance: 'Champion with ${amount} Net Balance!',
    playAgainBtn: 'Start New Game',
    viewStatsBtn: 'View Profile & Stats',

    // Profile & Social Modal
    profileTitle: 'User Profile & Statistics',
    tabStats: 'Stats',
    tabFriends: 'Friends',
    tabRequests: 'Requests',
    tabAddFriend: 'Add',
    friendCodeLabel: 'Your Friend Code',
    copyFriendCode: 'Copy Code',
    gamesWonStat: 'Games Won',
    gamesPlayedStat: 'Games Played',
    netWorthStat: 'Net Worth',
    friendsOnline: 'Online Friends',
    noFriendsYet: 'No friends in your list yet. Share your friend code to connect!',
    noPendingRequests: 'No pending friend requests.',
    enterFriendCodePlaceholder: 'Enter Friend Code (e.g. TP-XXXXXX)',
    sendFriendRequestBtn: 'Send Request',
    inviteFriendToRoom: 'Invite to Room',
    acceptRequest: 'Accept',
    rejectRequest: 'Decline',

    // Contact Modal
    contactTitle: 'Contact & Feedback',
    contactSubtitle: 'Get in touch with us',
    contactDescription: 'For any questions, suggestions, bug reports, feature requests, or collaboration opportunities regarding Turkish Paradise, feel free to reach out to us via our official email.',
    officialEmailLabel: 'Official Email Address',
    openInEmailApp: 'Open in Email Client',
    suggestionsTag: '💡 Suggestions',
    suggestionsDesc: 'New ideas & requests',
    bugReportTag: '🐛 Bug Reports',
    bugReportDesc: 'Report issues & bugs',
    collabTag: '🤝 Collaboration',
    collabDesc: 'Community & partnerships',

    // Info Modals (Rules, Features, Community)
    rulesModalTitle: 'How to Play (Game Rules)',
    featuresModalTitle: 'Turkish Paradise Features',
    communityModalTitle: 'Community & Multiplayer',

    // Sidebars
    playerListHeader: 'Players Status',
    playersCountBadge: '{count} Players',
    chatHeader: 'Game Chat',
    chatPlaceholder: 'Type a message...',
    chatDisabledPlaceholder: 'Join the game to chat',
    logsHeader: 'Game Flow & Notifications',
    afkBadge: 'AFK (BOT)',
    jailedBadge: 'IN JAIL',
    propertyCount: '{count} Properties',

    // Debt Settlement & Bankruptcy Recovery
    debtSettlementTitle: '⚠️ Debt Settlement & Recovery',
    debtSettlementInstruction: 'Your balance is negative! Sell properties, sell houses, or trade with players to clear debt.',
    debtSettlementWaiting: '🎲 {name} is liquidating assets or trading to pay off debt...',
    managePropertiesBtn: 'Sell Assets / Mortgage 🏠',
    tradeForCashBtn: 'Trade for Cash 🤝',
    surrenderBankruptcyBtn: 'Declare Bankruptcy (Forfeit) 💀',

    // Spectator Mode
    spectatorBadge: 'Spectator 👁️',
    bankruptBadge: 'Bankrupt (Watching)',
    spectatorBanner: '👁️ You are bankrupt, but you can continue watching the game live and chatting in the room.',
    spectatorMode: 'Spectator Mode',

    // Public Rooms
    publicRoomsBtn: '🌐 Live Rooms',
    publicRoomsTitle: 'Public Live Rooms',
    shareRoomPublicly: 'Publish Room Publicly 🌐',
    roomPublishedNotice: 'Room published to live directory!',

    // Common
    currencySymbol: '$',
    loginBtn: 'Sign In',
    mobilePlayersTab: 'Players ({count})',
    mobileChatTab: 'Chat',
    mobileLogsTab: 'Logs',
    mobilePlayerStatus: 'Players Status',
    mobileGameChat: 'Game Chat',
    mobileLogsAlerts: 'Logs & Activity',
  }
};

export const CHANCE_CARDS_TRANSLATIONS: Record<Language, Record<string, { title: string; description: string }>> = {
  tr: {
    c1: { title: 'Banka İkramiyesi', description: 'Devlet tahvilleriniz değer kazandı. Bankadan 200₺ tahsil edin.' },
    c2: { title: 'Hız Sınırı Cezası', description: 'Trafik radarında hız sınırını aştınız. 100₺ ceza ödeyin.' },
    c3: { title: 'Doğrudan Kodese!', description: 'Polis sizi yakaladı! Doğrudan kodese gidin, başlangıçtan geçmeyin.' },
    c4: { title: 'Başlangıç Noktasına İlerle', description: 'Hemen Başlangıç karesine ilerleyin ve 200₺ alın.' },
    c5: { title: 'İstanbul Turu', description: 'İstanbul\'a kadar ilerleyin. Başlangıçtan geçerseniz 200₺ kazanın.' },
    c6: { title: 'Miras Kaldı', description: 'Uzak bir akrabanızdan gayrimenkul mirası kaldı. 150₺ kazandınız.' },
    c7: { title: 'Bina Bakım Masrafı', description: 'Tüm mülklerinizin bakımı için her bina başına 25₺ masraf ödeyin.' },
    c8: { title: 'Vergi İadesi', description: 'Maliye fazla kesilen vergilerinizi iade etti. 100₺ aldınız.' },
    c9: { title: 'Doktor ve Sağlık Gideri', description: 'Özel hastane muayene ve ilaç masrafları için 50₺ ödeyin.' },
    c10: { title: 'İskele Seyahati', description: 'En yakın iskeleye (Kadıköy İskelesi) hızlı seyahat edin.' },
    c11: { title: 'Piyango Talihlisi', description: 'Şans oyunundan küçük ikramiye tutturdunuz! 80₺ kazandınız.' },
    c12: { title: 'Hayır Kurumu Bağışı', description: 'Şehir vakfına 60₺ bağışta bulundunuz.' },
    c13: { title: 'Tatil Köyü Geliri', description: 'Antalya\'daki turizm yatırımlarınızdan 120₺ kar payı aldınız.' },
    c14: { title: 'Belediye Harç Ödemesi', description: 'Ruhsat ve çevre temizlik harcı olarak 70₺ ödeyin.' },
    c15: { title: 'Şanslı Buluntu', description: 'Vapur iskelesinde unutulmuş cüzdan buldunuz ve teslim ödülü olarak 50₺ aldınız!' }
  },
  en: {
    c1: { title: 'Bank Dividend', description: 'Your government bonds matured. Collect $200 from the bank.' },
    c2: { title: 'Speeding Ticket', description: 'You were caught by speed radar. Pay $100 fine.' },
    c3: { title: 'Go Directly to Jail!', description: 'You have been caught! Go directly to jail, do not pass GO.' },
    c4: { title: 'Advance to GO', description: 'Advance directly to GO and collect $200.' },
    c5: { title: 'Trip to Istanbul', description: 'Advance to Istanbul. If you pass GO, collect $200.' },
    c6: { title: 'Inheritance', description: 'You inherited real estate from a distant relative. Collect $150.' },
    c7: { title: 'Property Maintenance', description: 'Pay $25 for general maintenance for each building you own.' },
    c8: { title: 'Tax Refund', description: 'Tax office refunded overpaid taxes. Collect $100.' },
    c9: { title: 'Medical Expenses', description: 'Pay $50 for private clinic and pharmacy bills.' },
    c10: { title: 'Ferry Trip', description: 'Take a fast ferry to the nearest station (Kadikoy Ferry).' },
    c11: { title: 'Lottery Winner', description: 'You won a small prize in the city lottery! Collect $80.' },
    c12: { title: 'Charity Donation', description: 'You made a donation of $60 to the local charity foundation.' },
    c13: { title: 'Resort Profits', description: 'You received a $120 dividend from your tourism investments in Antalya.' },
    c14: { title: 'Municipal Fee', description: 'Pay $70 for business licensing and environmental sanitation fees.' },
    c15: { title: 'Lucky Find', description: 'You returned a lost wallet at the ferry pier and received a $50 reward!' }
  }
};

export const TILE_TRANSLATIONS: Record<Language, Record<string, { name?: string; subtitle?: string }>> = {
  tr: {
    'BAŞLANGIÇ': { name: 'BAŞLANGIÇ', subtitle: 'Geçerken ₺200 al' },
    'HAPİSHANE': { name: 'HAPİSHANE', subtitle: 'Ziyaretçi / Mahpus' },
    'ÜCRETSİZ OTOPARK': { name: 'ÜCRETSİZ OTOPARK', subtitle: 'Dinlenme Alanı' },
    'KODESE GİT': { name: 'KODESE GİT', subtitle: 'Doğrudan Kodese!' },
    'ŞANS': { name: 'ŞANS', subtitle: 'Kart Çek' },
    'KAMU FONU': { name: 'KAMU FONU', subtitle: 'Sandık Kartı' },
    'GELİR VERGİSİ': { name: 'GELİR VERGİSİ', subtitle: '₺200 Öde' },
    'LÜKS VERGİSİ': { name: 'LÜKS VERGİSİ', subtitle: '₺100 Öde' },
    'KADIKÖY': { subtitle: 'İskele' },
    'KABATAŞ': { subtitle: 'İskele' },
    'BEŞİKTAŞ': { subtitle: 'İskele' },
    'ÜSKÜDAR': { subtitle: 'İskele' },
    'BOĞAZ KÖPRÜSÜ': { subtitle: 'Geçiş Ücreti' }
  },
  en: {
    'BAŞLANGIÇ': { name: 'START / GO', subtitle: 'Collect $200 passing' },
    'HAPİSHANE': { name: 'JAIL', subtitle: 'Just Visiting / In Jail' },
    'ÜCRETSİZ OTOPARK': { name: 'FREE PARKING', subtitle: 'Rest Area' },
    'KODESE GİT': { name: 'GO TO JAIL', subtitle: 'Directly to Jail!' },
    'ŞANS': { name: 'CHANCE', subtitle: 'Draw a Card' },
    'KAMU FONU': { name: 'COMMUNITY CHEST', subtitle: 'Chest Card' },
    'GELİR VERGİSİ': { name: 'INCOME TAX', subtitle: 'Pay $200' },
    'LÜKS VERGİSİ': { name: 'LUXURY TAX', subtitle: 'Pay $100' },
    'KADIKÖY': { subtitle: 'Ferry Pier' },
    'KABATAŞ': { subtitle: 'Ferry Pier' },
    'BEŞİKTAŞ': { subtitle: 'Ferry Pier' },
    'ÜSKÜDAR': { subtitle: 'Ferry Pier' },
    'BOĞAZ KÖPRÜSÜ': { name: 'BOSPHORUS BRIDGE', subtitle: 'Toll Station' }
  }
};
