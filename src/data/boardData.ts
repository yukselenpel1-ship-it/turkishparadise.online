import { BoardTile } from '../types/game';

export const INITIAL_BOARD: BoardTile[] = [
  // 0: Corner - Başlangıç
  {
    id: 0,
    name: 'BAŞLANGIÇ',
    type: 'start',
    subtitle: 'Geçerken ₺200 al',
    icon: '➔',
    houses: 0,
    isMortgaged: false
  },
  // 1-3: Kahverengi Grubu (3 Şehir)
  {
    id: 1,
    name: 'HATAY',
    type: 'property',
    price: 60,
    rent: [2, 10, 30, 90, 160, 250],
    houseCost: 50,
    colorGroup: 'brown',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1596401057633-54a8fe8ef647?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 2,
    name: 'MERSİN',
    type: 'property',
    price: 60,
    rent: [4, 20, 60, 180, 320, 450],
    houseCost: 50,
    colorGroup: 'brown',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 3,
    name: 'ADANA',
    type: 'property',
    price: 80,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    colorGroup: 'brown',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=300&q=80'
  },
  // 4: İskele 1
  {
    id: 4,
    name: 'KADIKÖY',
    type: 'station',
    price: 200,
    rent: [50, 100, 150, 200],
    icon: '⚓',
    subtitle: 'İskele',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=300&q=80'
  },
  // 5: Şans 1
  {
    id: 5,
    name: 'ŞANS',
    type: 'chance',
    icon: '?',
    subtitle: 'Kart Çek',
    houses: 0,
    isMortgaged: false
  },
  // 6-8: Açık Mavi Grubu (3 Şehir)
  {
    id: 6,
    name: 'ORDU',
    type: 'property',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    colorGroup: 'lightblue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 7,
    name: 'SAMSUN',
    type: 'property',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    colorGroup: 'lightblue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 8,
    name: 'TRABZON',
    type: 'property',
    price: 120,
    rent: [8, 40, 100, 300, 450, 600],
    houseCost: 50,
    colorGroup: 'lightblue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80'
  },
  // 9: Corner - Kodes
  {
    id: 9,
    name: 'HAPİSHANE',
    type: 'jail',
    icon: '🔒',
    subtitle: 'Sadece Ziyaret',
    houses: 0,
    isMortgaged: false
  },
  // 10-12: Pembe Grubu (3 Şehir)
  {
    id: 10,
    name: 'AFYON',
    type: 'property',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
    colorGroup: 'pink',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 11,
    name: 'KONYA',
    type: 'property',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
    colorGroup: 'pink',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 12,
    name: 'ESKİŞEHİR',
    type: 'property',
    price: 160,
    rent: [12, 60, 180, 500, 700, 900],
    houseCost: 100,
    colorGroup: 'pink',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=300&q=80'
  },
  // 13: İskele 2
  {
    id: 13,
    name: 'KABATAŞ',
    type: 'station',
    price: 200,
    rent: [50, 100, 150, 200],
    icon: '⚓',
    subtitle: 'İskele',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1527838832700-5059252407fa?auto=format&fit=crop&w=300&q=80'
  },
  // 14: Kamu Fonu 1
  {
    id: 14,
    name: 'KAMU FONU',
    type: 'chest',
    icon: '📦',
    subtitle: 'Sandık',
    houses: 0,
    isMortgaged: false
  },
  // 15-17: Turuncu Grubu (3 Şehir)
  {
    id: 15,
    name: 'MALATYA',
    type: 'property',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
    colorGroup: 'orange',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 16,
    name: 'GAZİANTEP',
    type: 'property',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
    colorGroup: 'orange',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 17,
    name: 'ŞANLIURFA',
    type: 'property',
    price: 200,
    rent: [16, 80, 220, 600, 800, 1000],
    houseCost: 100,
    colorGroup: 'orange',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80'
  },
  // 18: Kırmızı Grubu 1/4
  {
    id: 18,
    name: 'BATMAN',
    type: 'property',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
    colorGroup: 'red',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=300&q=80'
  },
  // 19: Corner - Ücretsiz Otopark
  {
    id: 19,
    name: 'ÜCRETSİZ OTOPARK',
    type: 'parking',
    icon: '🅿️',
    subtitle: 'Dinlenme',
    houses: 0,
    isMortgaged: false
  },
  // 20-22: Kırmızı Grubu 2,3,4
  {
    id: 20,
    name: 'MARDİN',
    type: 'property',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
    colorGroup: 'red',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 21,
    name: 'DİYARBAKIR',
    type: 'property',
    price: 240,
    rent: [20, 100, 300, 750, 925, 1100],
    houseCost: 150,
    colorGroup: 'red',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 22,
    name: 'SİİRT',
    type: 'property',
    price: 240,
    rent: [20, 100, 300, 750, 925, 1100],
    houseCost: 150,
    colorGroup: 'red',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=300&q=80'
  },
  // 23: İskele 3
  {
    id: 23,
    name: 'BEŞİKTAŞ',
    type: 'station',
    price: 200,
    rent: [50, 100, 150, 200],
    icon: '⚓',
    subtitle: 'İskele',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?auto=format&fit=crop&w=300&q=80'
  },
  // 24: Şans 2
  {
    id: 24,
    name: 'ŞANS',
    type: 'chance',
    icon: '?',
    subtitle: 'Kart Çek',
    houses: 0,
    isMortgaged: false
  },
  // 25-27: Sarı Grubu (3 Şehir)
  {
    id: 25,
    name: 'DENİZLİ',
    type: 'property',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    colorGroup: 'yellow',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1508672019048-805b876b67e2?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 26,
    name: 'ANTALYA',
    type: 'property',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    colorGroup: 'yellow',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 27,
    name: 'BURSA',
    type: 'property',
    price: 280,
    rent: [24, 120, 360, 850, 1025, 1200],
    houseCost: 150,
    colorGroup: 'yellow',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=300&q=80'
  },
  // 28: Corner - Kodese Git
  {
    id: 28,
    name: 'KODESE GİT',
    type: 'gotojail',
    icon: '🚨',
    subtitle: 'Doğrudan Kodese',
    houses: 0,
    isMortgaged: false
  },
  // 29-31: Yeşil Grubu (3 Şehir)
  {
    id: 29,
    name: 'BALIKESİR',
    type: 'property',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
    colorGroup: 'green',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 30,
    name: 'ÇANAKKALE',
    type: 'property',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
    colorGroup: 'green',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 31,
    name: 'AYDIN',
    type: 'property',
    price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400],
    houseCost: 200,
    colorGroup: 'green',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=300&q=80'
  },
  // 32: İskele 4
  {
    id: 32,
    name: 'ÜSKÜDAR',
    type: 'station',
    price: 200,
    rent: [50, 100, 150, 200],
    icon: '⚓',
    subtitle: 'İskele',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=300&q=80'
  },
  // 33: Kamu Fonu 2
  {
    id: 33,
    name: 'KAMU FONU',
    type: 'chest',
    icon: '📦',
    subtitle: 'Sandık',
    houses: 0,
    isMortgaged: false
  },
  // 34-37: Koyu Mavi Grubu (4 Şehir)
  {
    id: 34,
    name: 'MANİSA',
    type: 'property',
    price: 340,
    rent: [30, 160, 480, 1050, 1250, 1450],
    houseCost: 200,
    colorGroup: 'blue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 35,
    name: 'İZMİR',
    type: 'property',
    price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500],
    houseCost: 200,
    colorGroup: 'blue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 36,
    name: 'ANKARA',
    type: 'property',
    price: 380,
    rent: [40, 190, 550, 1200, 1400, 1650],
    houseCost: 200,
    colorGroup: 'blue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1596401057633-54a8fe8ef647?auto=format&fit=crop&w=300&q=80'
  },
  {
    id: 37,
    name: 'İSTANBUL',
    type: 'property',
    price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000],
    houseCost: 200,
    colorGroup: 'blue',
    houses: 0,
    isMortgaged: false,
    image: 'https://images.unsplash.com/photo-1527838832700-5059252407fa?auto=format&fit=crop&w=300&q=80'
  }
];
