/**
 * First-launch content so volunteers see a working example immediately.
 * Everything here is in the public domain (hymns written before 1900,
 * KJV and Louis Segond 1910 Bible text). Users may delete all of it.
 */
import type { AppCoreRepos } from './core';
import type { Service, Song } from '../shared/types';
import { parseLyrics } from '../shared/lyrics';
import { newId, nowIso } from '../shared/util';

interface SeedSong {
  title: string;
  author: string;
  categories: string[];
  lyrics: string;
  order?: string;
}

const SONGS: SeedSong[] = [
  {
    title: 'Amazing Grace',
    author: 'John Newton (1779)',
    categories: ['Hymn', 'Worship'],
    lyrics: `[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!
I once was lost, but now am found;
Was blind, but now I see.

[Verse 2]
'Twas grace that taught my heart to fear,
And grace my fears relieved;
How precious did that grace appear
The hour I first believed.

[Verse 3]
Through many dangers, toils and snares,
I have already come;
'Tis grace hath brought me safe thus far,
And grace will lead me home.

[Verse 4]
When we've been there ten thousand years,
Bright shining as the sun,
We've no less days to sing God's praise
Than when we'd first begun.`,
  },
  {
    title: 'Holy, Holy, Holy',
    author: 'Reginald Heber (1826)',
    categories: ['Hymn', 'Praise'],
    lyrics: `[Verse 1]
Holy, holy, holy! Lord God Almighty!
Early in the morning our song shall rise to Thee;
Holy, holy, holy, merciful and mighty!
God in three Persons, blessed Trinity!

[Verse 2]
Holy, holy, holy! All the saints adore Thee,
Casting down their golden crowns around the glassy sea;
Cherubim and seraphim falling down before Thee,
Which wert, and art, and evermore shalt be.

[Verse 3]
Holy, holy, holy! Though the darkness hide Thee,
Though the eye of sinful man Thy glory may not see;
Only Thou art holy; there is none beside Thee,
Perfect in power, in love, and purity.

[Verse 4]
Holy, holy, holy! Lord God Almighty!
All Thy works shall praise Thy name, in earth, and sky, and sea;
Holy, holy, holy; merciful and mighty!
God in three Persons, blessed Trinity!`,
  },
  {
    title: 'It Is Well with My Soul',
    author: 'Horatio G. Spafford (1873)',
    categories: ['Hymn', 'Worship'],
    lyrics: `[Verse 1]
When peace like a river attendeth my way,
When sorrows like sea billows roll;
Whatever my lot, Thou hast taught me to say,
It is well, it is well with my soul.

[Chorus]
It is well with my soul,
It is well, it is well with my soul.

[Verse 2]
Though Satan should buffet, though trials should come,
Let this blest assurance control,
That Christ has regarded my helpless estate,
And hath shed His own blood for my soul.

[Verse 3]
My sin, oh, the bliss of this glorious thought!
My sin, not in part but the whole,
Is nailed to the cross, and I bear it no more,
Praise the Lord, praise the Lord, O my soul!

[Verse 4]
And Lord, haste the day when my faith shall be sight,
The clouds be rolled back as a scroll;
The trump shall resound, and the Lord shall descend,
Even so, it is well with my soul.`,
    order: 'V1 C V2 C V3 C V4 C',
  },
  {
    title: 'À toi la gloire',
    author: 'Edmond Budry (1884)',
    categories: ['Cantique', 'Praise'],
    lyrics: `[Couplet 1]
À toi la gloire, Ô Ressuscité !
À toi la victoire Pour l'éternité !

Brillant de lumière, L'ange est descendu,
Il roule la pierre Du tombeau vaincu.

[Refrain]
À toi la gloire, Ô Ressuscité !
À toi la victoire Pour l'éternité !

[Couplet 2]
Vois-le paraître : C'est lui, c'est Jésus,
Ton Sauveur, ton Maître ! Oh ! ne doute plus !

Sois dans l'allégresse, Peuple du Seigneur,
Et redis sans cesse : Le Christ est vainqueur !

[Couplet 3]
Craindrais-je encore ? Il vit à jamais,
Celui que j'adore, Le Prince de paix ;

Il est ma victoire, Mon puissant soutien,
Ma vie et ma gloire : Non, je ne crains rien !`,
    order: 'V1 C V2 C V3 C',
  },
  {
    title: 'Doxology',
    author: 'Thomas Ken (1674)',
    categories: ['Hymn', 'Closing'],
    lyrics: `[Verse 1]
Praise God, from whom all blessings flow;
Praise Him, all creatures here below;
Praise Him above, ye heavenly host;
Praise Father, Son, and Holy Ghost. Amen.`,
  },
];

const KJV_SAMPLE: Array<[number, number, number, string]> = [
  [19, 23, 1, 'The LORD is my shepherd; I shall not want.'],
  [19, 23, 2, 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.'],
  [19, 23, 3, "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."],
  [19, 23, 4, 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.'],
  [19, 23, 5, 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.'],
  [19, 23, 6, 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.'],
  [43, 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'],
  [43, 3, 17, 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.'],
];

const LSG_SAMPLE: Array<[number, number, number, string]> = [
  [19, 23, 1, "Cantique de David. L'Éternel est mon berger: je ne manquerai de rien."],
  [19, 23, 2, 'Il me fait reposer dans de verts pâturages, Il me dirige près des eaux paisibles.'],
  [19, 23, 3, 'Il restaure mon âme, Il me conduit dans les sentiers de la justice, À cause de son nom.'],
  [19, 23, 4, "Quand je marche dans la vallée de l'ombre de la mort, Je ne crains aucun mal, car tu es avec moi: Ta houlette et ton bâton me rassurent."],
  [19, 23, 5, "Tu dresses devant moi une table, En face de mes adversaires; Tu oins d'huile ma tête, Et ma coupe déborde."],
  [19, 23, 6, "Oui, le bonheur et la grâce m'accompagneront Tous les jours de ma vie, Et j'habiterai dans la maison de l'Éternel Jusqu'à la fin de mes jours."],
  [43, 3, 16, "Car Dieu a tant aimé le monde qu'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu'il ait la vie éternelle."],
  [43, 3, 17, "Dieu, en effet, n'a pas envoyé son Fils dans le monde pour qu'il juge le monde, mais pour que le monde soit sauvé par lui."],
];

function seedSong(s: SeedSong): Song {
  const sections = parseLyrics(s.lyrics);
  const arrangement = s.order ? { id: newId(), name: 'Default', order: s.order.split(' ') } : null;
  return {
    id: newId(),
    title: s.title,
    author: s.author,
    copyright: 'Public domain',
    ccli: '',
    key: '',
    notes: '',
    categories: s.categories,
    sections,
    arrangements: arrangement ? [arrangement] : [],
    defaultArrangementId: arrangement?.id ?? null,
    themeId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

/** Inserts the starter content once. Returns true if something was added. */
export function seedFirstRun(repos: AppCoreRepos): boolean {
  if (repos.settings.getRaw<boolean>('seeded', false)) return false;
  const songs = SONGS.map((s) => repos.songs.save(seedSong(s)));

  const kjv = repos.bible.addTranslation(
    { name: 'King James Version (sample)', abbreviation: 'KJV', language: 'en', license: 'Public domain — sample only, import the full text' },
    {
      books: [{ number: 19, name: 'Psalms' }, { number: 43, name: 'John' }],
      verses: KJV_SAMPLE.map(([book, chapter, verse, text]) => ({ book, chapter, verse, text })),
    },
  );
  repos.bible.addTranslation(
    { name: 'Louis Segond 1910 (extrait)', abbreviation: 'LSG', language: 'fr', license: 'Domaine public — extrait, importez le texte complet' },
    {
      books: [{ number: 19, name: 'Psaumes' }, { number: 43, name: 'Jean' }],
      verses: LSG_SAMPLE.map(([book, chapter, verse, text]) => ({ book, chapter, verse, text })),
    },
  );
  repos.settings.update({ defaultTranslationId: kjv.id });

  const song = (title: string) => songs.find((s) => s.title === title)!;
  const template: Service = {
    id: newId(),
    name: 'Sunday Service',
    date: '',
    isTemplate: true,
    notes: 'Starter template — edit it to match your order of service.',
    createdAt: '',
    updatedAt: '',
    items: [
      {
        id: newId(),
        type: 'announcement',
        title: 'Welcome',
        themeId: null,
        notes: '',
        slides: [{ title: 'Welcome', body: 'We are glad you are here.\nPlease silence your phones.', imagePath: null }],
      },
      { id: newId(), type: 'header', title: 'Worship', themeId: null, notes: '' },
      { id: newId(), type: 'song', title: 'Holy, Holy, Holy', themeId: null, notes: '', songId: song('Holy, Holy, Holy').id, arrangementId: null },
      { id: newId(), type: 'song', title: 'It Is Well with My Soul', themeId: null, notes: '', songId: song('It Is Well with My Soul').id, arrangementId: null },
      { id: newId(), type: 'header', title: 'The Word', themeId: null, notes: '' },
      { id: newId(), type: 'bible', title: 'Psalm 23', themeId: null, notes: '', translationId: kjv.id, reference: 'Psalm 23', versesPerSlide: 1, showVerseNumbers: true },
      { id: newId(), type: 'blank', title: 'Sermon (blank)', themeId: null, notes: '' },
      { id: newId(), type: 'header', title: 'Response', themeId: null, notes: '' },
      { id: newId(), type: 'song', title: 'Amazing Grace', themeId: null, notes: '', songId: song('Amazing Grace').id, arrangementId: null },
      {
        id: newId(),
        type: 'announcement',
        title: 'Announcements',
        themeId: null,
        notes: '',
        slides: [
          { title: 'This Week', body: 'Wednesday 7:00 PM — Prayer meeting\nFriday 7:30 PM — Youth night\nSunday 10:00 AM — Worship service', imagePath: null },
        ],
      },
      { id: newId(), type: 'song', title: 'Doxology', themeId: null, notes: '', songId: song('Doxology').id, arrangementId: null },
      {
        id: newId(),
        type: 'announcement',
        title: 'Closing',
        themeId: null,
        notes: '',
        slides: [{ title: 'Go in peace', body: 'Thank you for worshipping with us today.', imagePath: null }],
      },
    ],
  };
  repos.services.save(template);
  repos.settings.setRaw('seeded', true);
  return true;
}
