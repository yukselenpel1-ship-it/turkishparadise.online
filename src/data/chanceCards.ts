import { ChanceCard } from '../types/game';

export const CHANCE_CARDS: ChanceCard[] = [
  {
    id: 'c1',
    title: 'Banka İkramiyesi',
    description: 'Devlet tahvilleriniz değer kazandı. Bankadan 200₺ tahsil edin.',
    actionType: 'MONEY',
    amount: 200
  },
  {
    id: 'c2',
    title: 'Hız Sınırı Cezası',
    description: 'Trafik radarında hız sınırını aştınız. 100₺ ceza ödeyin.',
    actionType: 'MONEY',
    amount: -100
  },
  {
    id: 'c3',
    title: 'Doğrudan Kodese!',
    description: 'Polis sizi yakaladı! Doğrudan kodese gidin, başlangıçtan geçmeyin.',
    actionType: 'JAIL'
  },
  {
    id: 'c4',
    title: 'Başlangıç Noktasına İlerle',
    description: 'Hemen Başlangıç karesine ilerleyin ve 200₺ alın.',
    actionType: 'MOVE_TO',
    targetTileId: 0
  },
  {
    id: 'c5',
    title: 'İstanbul Turu',
    description: 'İstanbul\'a kadar ilerleyin. Başlangıçtan geçerseniz 200₺ kazanın.',
    actionType: 'MOVE_TO',
    targetTileId: 37
  },
  {
    id: 'c6',
    title: 'Miras Kaldı',
    description: 'Uzak bir akrabanızdan gayrimenkul mirası kaldı. 150₺ kazandınız.',
    actionType: 'MONEY',
    amount: 150
  },
  {
    id: 'c7',
    title: 'Bina Bakım Masrafı',
    description: 'Tüm mülklerinizin bakımı için her bina başına 25₺ masraf ödeyin.',
    actionType: 'REPAIR',
    amount: 25
  },
  {
    id: 'c8',
    title: 'Vergi İadesi',
    description: 'Maliye fazla kesilen vergilerinizi iade etti. 100₺ aldınız.',
    actionType: 'MONEY',
    amount: 100
  },
  {
    id: 'c9',
    title: 'Doktor ve Sağlık Gideri',
    description: 'Özel hastane muayene ve ilaç masrafları için 50₺ ödeyin.',
    actionType: 'MONEY',
    amount: -50
  },
  {
    id: 'c10',
    title: 'İskele Seyahati',
    description: 'En yakın iskeleye hızlı seyahat edin. Başlangıç noktasından geçerseniz 200₺ kazanın.',
    actionType: 'MOVE_TO'
  },
  {
    id: 'c11',
    title: 'Piyango Talihlisi',
    description: 'Şans oyunundan küçük ikramiye tutturdunuz! 80₺ kazandınız.',
    actionType: 'MONEY',
    amount: 80
  },
  {
    id: 'c12',
    title: 'Hayır Kurumu Bağışı',
    description: 'Şehir vakfına 60₺ bağışta bulundunuz.',
    actionType: 'MONEY',
    amount: -60
  },
  {
    id: 'c13',
    title: 'Tatil Köyü Geliri',
    description: 'Antalya\'daki turizm yatırımlarınızdan 120₺ kar payı aldınız.',
    actionType: 'MONEY',
    amount: 120
  },
  {
    id: 'c14',
    title: 'Belediye Harç Ödemesi',
    description: 'Ruhsat ve çevre temizlik harcı olarak 70₺ ödeyin.',
    actionType: 'MONEY',
    amount: -70
  },
  {
    id: 'c15',
    title: 'Şanslı Buluntu',
    description: 'Vapur iskelesinde unutulmuş cüzdan buldunuz ve teslim ödülü olarak 50₺ aldınız!',
    actionType: 'MONEY',
    amount: 50
  },
  {
    id: 'c16',
    title: 'Bir Oyuncuyu Kodese Gönder',
    description: 'İstediğiniz bir rakip oyuncuyu doğrudan Kodese gönderin!',
    actionType: 'SEND_TO_JAIL'
  },
  {
    id: 'c17',
    title: 'Bir Yapıyı Yık',
    description: 'Bir rakibinizin mülkündeki 1 adet yapıyı (ev veya otel) yıkın!',
    actionType: 'DEMOLISH_BUILDING'
  }
];
