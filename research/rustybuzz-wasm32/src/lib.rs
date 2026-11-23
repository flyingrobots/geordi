//! Cross-target determinism experiment for `rustybuzz` shaping
//! (flyingrobots/geordi#137).
//!
//! [`dump`] shapes [`STRING_COUNT`] Latin strings with the pinned Lato Regular
//! face under each of the [`CONFIGS`], and serialises every glyph's id,
//! cluster, `unsafe_to_break` flag, advances and offsets. The native binary and
//! the `wasm32-unknown-unknown` module both return the bytes of [`dump`];
//! `run.mjs` compares them bit for bit.
//!
//! The byte stream, all integers little-endian (`i32` written as its bits):
//!
//! ```text
//! stream := "RBZ1" run_count:u32 run*
//! run    := config:u32 string:u32 glyph_count:u32 glyph*
//! glyph  := glyph_id:u32 cluster:u32 unsafe_to_break:u32
//!           x_advance:i32 y_advance:i32 x_offset:i32 y_offset:i32
//! ```

use std::str::FromStr;

use rustybuzz::{BufferClusterLevel, Direction, Face, Feature, Language, UnicodeBuffer};

/// The pinned Lato Regular face (sha256
/// `d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251`).
pub const FONT: &[u8] =
    include_bytes!("../../../fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf");

/// Number of shaped strings per configuration.
pub const STRING_COUNT: usize = 200;

/// One way of shaping every string.
#[derive(Debug, Clone, Copy)]
pub struct Config {
    /// Stable name, used in reports.
    pub name: &'static str,
    /// Buffer direction.
    pub direction: Direction,
    /// Comma-separated `rustybuzz` feature strings (empty: the defaults).
    pub features: &'static str,
    /// BCP 47 language tag.
    pub language: &'static str,
    /// Cluster level.
    pub cluster_level: BufferClusterLevel,
}

/// The configurations.
///
/// `rtl-forced` and `vertical` are outside the card's aperture (horizontal
/// Latin text). They are there to reach more of the shaper: vertical
/// positioning asks for glyph extents and vertical origins, a path horizontal
/// text never takes.
pub const CONFIGS: [Config; 5] = [
    Config {
        name: "ltr-default",
        direction: Direction::LeftToRight,
        features: "",
        language: "en",
        cluster_level: BufferClusterLevel::MonotoneGraphemes,
    },
    Config {
        name: "ltr-no-kern-no-liga-characters",
        direction: Direction::LeftToRight,
        features: "-kern,-liga,-clig",
        language: "en",
        cluster_level: BufferClusterLevel::Characters,
    },
    Config {
        name: "ltr-optional-features-turkish",
        direction: Direction::LeftToRight,
        features: "+dlig,+smcp,+c2sc,+onum,+pnum,+tnum,+frac,+case,+sups,+subs,+ss01,+salt,+zero",
        language: "tr",
        cluster_level: BufferClusterLevel::MonotoneCharacters,
    },
    Config {
        name: "rtl-forced",
        direction: Direction::RightToLeft,
        features: "",
        language: "en",
        cluster_level: BufferClusterLevel::MonotoneGraphemes,
    },
    Config {
        name: "vertical",
        direction: Direction::TopToBottom,
        features: "",
        language: "en",
        cluster_level: BufferClusterLevel::MonotoneGraphemes,
    },
];

/// Hand-written strings: kerning pairs, ligatures, accented and decomposed
/// letters, combining marks, digits and fractions, punctuation and quotes,
/// spaces and invisible characters, and characters Lato does not cover.
const CURATED: [&str; 72] = [
    "AV",
    "office",
    "The quick brown fox jumps over the lazy dog.",
    "Sphinx of black quartz, judge my vow.",
    "AVAVAV WAVE Wave To Ta Te Ty Yo LT LV P. F, r. y.",
    "fi fl ff ffi ffl ft fj Th",
    "affine official waffle shuffle fjord Thursday",
    "f\u{200C}i f\u{200D}i f\u{00AD}i",
    "Kerning: AT AY AW Av Aw Ay FA LT LY PA TA Tc Te To Tr Tu Ty VA Va Ve Vo WA Wa We Wo YA Ya Ye Yo",
    "quotes \u{201C}curly\u{201D} \u{2018}single\u{2019} \"straight\" 'apos' \u{00AB}guillemets\u{00BB}",
    "1/2 3/4 1\u{2044}2 0123456789 \u{00BD} \u{00BC} \u{00BE}",
    "H\u{2082}O x\u{00B2} E=mc\u{00B2} 10\u{207B}\u{00B3}",
    "caf\u{00E9} cafe\u{0301} na\u{00EF}ve nai\u{0308}ve",
    "\u{00C5}ngstr\u{00F6}m A\u{030A}ngstro\u{0308}m",
    "a\u{0300}\u{0301}\u{0302}\u{0303}\u{0304} e\u{0323}\u{0302} o\u{031B}\u{0301}",
    "q\u{0307}\u{0323} x\u{0331} g\u{0327} z\u{0306}\u{0308}",
    "Stra\u{00DF}e STRASSE \u{1E9E}",
    "\u{0130}stanbul \u{0131}\u{0130} iI fi fl",
    "ijsselmeer IJSSELMEER \u{0132}\u{0133}",
    "\u{0141}\u{00F3}d\u{017A} \u{017B}\u{00F3}\u{0142}w \u{0119}\u{0105}",
    "\u{0160}\u{010D}\u{0159}\u{017E}\u{00FD}\u{00E1}\u{00ED}\u{00E9} \u{0158}\u{00ED}jen",
    "\u{00C6}sir \u{00D8}l \u{0152}uvre \u{00E6}\u{00F8}\u{0153}",
    "\u{00D0}\u{00F0} \u{00DE}\u{00FE} \u{0110}\u{0111} \u{0126}\u{0127}",
    "Vi\u{1EC7}t Nam ti\u{1EBF}ng Vi\u{1EC7}t \u{01A1}\u{01B0}",
    "\u{2014}em\u{2013}en-hyphen\u{2010}\u{2011}\u{2012}",
    "\u{2026}... !? \u{00A1}\u{00BF} \u{203D}",
    "a\u{00A0}b\u{2009}c\u{200A}d\u{2002}e\u{2003}f\u{202F}g",
    "zero\u{200B}width\u{2060}joiner\u{FEFF}bom",
    "tab\tsep\u{000B}x",
    "$\u{20AC}\u{00A3}\u{00A5}\u{00A2} 100% \u{2030} #@&*",
    "(brackets) [square] {curly} <angle>",
    "\u{00A9}\u{00AE}\u{2122} \u{00A7}\u{00B6} \u{2020}\u{2021}",
    "\u{00B0}C \u{00B1}5 \u{00D7}\u{00F7} \u{2212}1 \u{2248}",
    "ALL CAPS TITLE: KERNING AV TY",
    "small caps Small Caps smcp",
    "oldstyle 1234567890 lining",
    "WWWWWWWWWW iiiiiiiiii",
    "VAVAVAVAVAVAVAVAVAVAVAVAVAVAVAVA",
    "ffffffffffffiiiiiiiiiiii",
    "\u{0301}leading combining mark",
    "trailing combining\u{0301}\u{0302}\u{0303}\u{0304}\u{0305}\u{0306}\u{0307}\u{0308}",
    "a\u{034F}\u{0301} b\u{0360}c",
    "\u{2160}\u{2161}\u{2162} \u{2153}",
    "notdef: \u{4E2D}\u{6587} \u{0627}\u{0644} \u{05D0} \u{1F600}",
    "variation\u{FE00} selector\u{FE0F}",
    "e\u{0301}\u{0301}\u{0301}\u{0301}\u{0301}\u{0301}\u{0301}\u{0301}",
    "",
    " ",
    "a",
    "\u{00E5}",
    "Hello, World!",
    "GEORDI HELLO text 0123",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
    "Pack my box with five dozen liquor jugs.",
    "Jackdaws love my big sphinx of quartz.",
    "Quizdeltagerne spiste jordb\u{00E6}r med fl\u{00F8}de.",
    "Fran\u{00E7}ois Saint-\u{00C9}tienne \u{00C7}a va",
    "\u{00D1}and\u{00FA} se\u{00F1}or a\u{00F1}o",
    "Zw\u{00F6}lf Boxk\u{00E4}mpfer jagen Viktor quer \u{00FC}ber den gro\u{00DF}en Sylter Deich.",
    "P\u{0159}\u{00ED}li\u{0161} \u{017E}lu\u{0165}ou\u{010D}k\u{00FD} k\u{016F}\u{0148} \u{00FA}p\u{011B}l \u{010F}\u{00E1}belsk\u{00E9} \u{00F3}dy.",
    "\u{00C1}rv\u{00ED}zt\u{0171}r\u{0151} t\u{00FC}k\u{00F6}rf\u{00FA}r\u{00F3}g\u{00E9}p",
    "Fly-fishing flies; first-floor offices; afflicted",
    "1st 2nd 3rd 4th No. \u{2116}",
    "www.example.com/path?q=1&r=2#frag",
    "user@example.org",
    "C:\\path\\to\\file.txt",
    "x = (a + b) * c / d - e^f",
    "AV\u{0301}A\u{0308}V",
    "Yo! T\u{00F6}. V\u{00E4}. W\u{00E9}.",
    "\u{1E9B}\u{0323} \u{0149} \u{01C4}\u{01C5}\u{01C6}",
    "\u{FB01}\u{FB02} \u{FB00}\u{FB03}\u{FB04}",
    "\u{0300}",
];

/// The alphabet the generated strings draw from. It leans on letters that form
/// kerning pairs and ligatures, and includes precomposed and combining marks.
const ALPHABET: [char; 64] = [
    'a', 'e', 'f', 'f', 'i', 'l', 'o', 't', 'y', 'v', 'w', 'r', 'n', 's', 'j', 'h', 'A', 'V', 'W',
    'Y', 'T', 'L', 'P', 'F', 'K', 'O', 'Q', 'J', ' ', ' ', '.', ',', '\'', '"', '-', '1', '2', '/',
    '4', '0', '\u{00E9}', '\u{00F6}', '\u{00C5}', '\u{00DF}', '\u{0131}', '\u{0130}', '\u{0153}',
    '\u{00E6}', '\u{0301}', '\u{0308}', '\u{0323}', '\u{0327}', '\u{030A}', '\u{200C}', '\u{00A0}',
    '\u{2019}', '\u{201C}', '\u{2013}', 'T', 'o', 'A', 'v', 'f', 'i',
];

/// splitmix64: integer-only, so the generated strings cannot depend on the target.
#[derive(Debug, Clone)]
struct Rng(u64);

impl Rng {
    const fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n as u64)).unwrap_or(0)
    }
}

/// The [`STRING_COUNT`] strings: [`CURATED`] first, then generated ones of
/// growing length.
#[must_use]
pub fn strings() -> Vec<String> {
    let mut out: Vec<String> = CURATED.iter().map(|text| (*text).to_owned()).collect();
    let mut rng = Rng(0x00B0_7137);
    while out.len() < STRING_COUNT {
        let length = 1 + rng.below(8 + out.len());
        out.push(
            (0..length)
                .map(|_| ALPHABET[rng.below(ALPHABET.len())])
                .collect(),
        );
    }
    out
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_i32(out: &mut Vec<u8>, value: i32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn features(config: &Config) -> Vec<Feature> {
    config
        .features
        .split(',')
        .filter(|entry| !entry.is_empty())
        .filter_map(|entry| Feature::from_str(entry).ok())
        .collect()
}

/// The complete byte stream: every string under every configuration. An empty
/// vector means the face did not parse.
#[must_use]
pub fn dump() -> Vec<u8> {
    let Some(face) = Face::from_slice(FONT, 0) else {
        return Vec::new();
    };
    let texts = strings();
    let mut out = Vec::new();
    out.extend_from_slice(b"RBZ1");
    push_u32(
        &mut out,
        u32::try_from(CONFIGS.len() * texts.len()).unwrap_or(u32::MAX),
    );
    for (config_index, config) in CONFIGS.iter().enumerate() {
        let features = features(config);
        for (string_index, text) in texts.iter().enumerate() {
            let mut buffer = UnicodeBuffer::new();
            buffer.push_str(text);
            buffer.set_direction(config.direction);
            buffer.set_script(rustybuzz::script::LATIN);
            if let Ok(language) = Language::from_str(config.language) {
                buffer.set_language(language);
            }
            buffer.set_cluster_level(config.cluster_level);
            let shaped = rustybuzz::shape(&face, &features, buffer);
            push_u32(&mut out, u32::try_from(config_index).unwrap_or(u32::MAX));
            push_u32(&mut out, u32::try_from(string_index).unwrap_or(u32::MAX));
            push_u32(&mut out, u32::try_from(shaped.len()).unwrap_or(u32::MAX));
            for (info, position) in shaped.glyph_infos().iter().zip(shaped.glyph_positions()) {
                push_u32(&mut out, info.glyph_id);
                push_u32(&mut out, info.cluster);
                push_u32(&mut out, u32::from(info.unsafe_to_break()));
                push_i32(&mut out, position.x_advance);
                push_i32(&mut out, position.y_advance);
                push_i32(&mut out, position.x_offset);
                push_i32(&mut out, position.y_offset);
            }
        }
    }
    out
}

#[cfg(target_arch = "wasm32")]
#[expect(
    unsafe_code,
    reason = "the two exports need stable symbol names for the JavaScript host"
)]
mod wasm {
    use std::sync::OnceLock;

    static DUMP: OnceLock<Vec<u8>> = OnceLock::new();

    /// Runs the experiment (once) and returns the address of the byte stream.
    #[unsafe(no_mangle)]
    pub extern "C" fn dump_ptr() -> *const u8 {
        DUMP.get_or_init(super::dump).as_ptr()
    }

    /// Runs the experiment (once) and returns the length of the byte stream.
    #[unsafe(no_mangle)]
    pub extern "C" fn dump_len() -> usize {
        DUMP.get_or_init(super::dump).len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn there_are_exactly_the_promised_strings() {
        let texts = strings();
        assert_eq!(texts.len(), STRING_COUNT);
        assert!(
            texts
                .iter()
                .skip(CURATED.len())
                .all(|text| !text.is_empty())
        );
    }

    #[test]
    fn every_feature_string_parses() {
        for config in &CONFIGS {
            let parsed = features(config).len();
            let written = config
                .features
                .split(',')
                .filter(|entry| !entry.is_empty())
                .count();
            assert_eq!(parsed, written, "{}", config.name);
        }
    }

    #[test]
    fn the_face_kerns_and_ligates() -> Result<(), String> {
        let face = Face::from_slice(FONT, 0).ok_or("Lato does not parse")?;
        let shape = |text: &str, features: &[Feature]| {
            let mut buffer = UnicodeBuffer::new();
            buffer.push_str(text);
            rustybuzz::shape(&face, features, buffer)
        };
        let no_kern = [Feature::from_str("-kern")?];
        let kerned: i32 = shape("AV", &[])
            .glyph_positions()
            .iter()
            .map(|p| p.x_advance)
            .sum();
        let plain: i32 = shape("AV", &no_kern)
            .glyph_positions()
            .iter()
            .map(|p| p.x_advance)
            .sum();
        assert!(kerned < plain, "AV is not kerned: {kerned} vs {plain}");
        assert!(shape("office", &[]).len() < 6, "office has no ligature");
        assert_eq!(&dump()[..4], b"RBZ1");
        Ok(())
    }
}
