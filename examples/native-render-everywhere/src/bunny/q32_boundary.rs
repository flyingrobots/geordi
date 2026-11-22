//! Exact conversions between the bunny demo's binary64 values and Bunny's Q32.32 numbers.
//!
//! This module owns the only place where the demo's `f64` values cross into or out of Q32.32.
//! Bunny 0.7.1 has float ingress only from `f32` (`FixedQ32_32::try_from_f32`), which would
//! discard 29 bits of every fixture coordinate before rounding, and no egress to `f64`.
//!
//! Ingress follows the rule Geordi's `geordi-fixed-q32.32/1` profile states for compiler
//! normalization: round the exact value to the nearest raw unit, ties to even, and refuse values
//! whose raw value is outside the JavaScript safe-integer range `-(2^53 - 1)..=2^53 - 1`.

use bunny_num::FixedQ32_32;

/// Raw Q32.32 units per unit: `2^32`.
const RAW_PER_UNIT: f64 = 4_294_967_296.0;

/// Largest accepted raw magnitude: `2^53 - 1`, the JavaScript safe-integer maximum.
const RAW_MAGNITUDE_MAX: f64 = 9_007_199_254_740_991.0;

/// Converts a binary64 value to the nearest Q32.32 value, ties to even.
///
/// Returns `None` for a non-finite value or one whose rounded raw value is outside
/// `-(2^53 - 1)..=2^53 - 1` (about ±2,097,152 units).
pub(super) fn fixed_from_f64(value: f64) -> Option<FixedQ32_32> {
    // Multiplying by a power of two is exact for every finite input in range, so the only
    // rounding is `round_ties_even`, which rounds the exact value to an integer.
    let scaled = (value * RAW_PER_UNIT).round_ties_even();
    if !(-RAW_MAGNITUDE_MAX..=RAW_MAGNITUDE_MAX).contains(&scaled) {
        return None;
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "scaled is an integer with magnitude at most 2^53 - 1, so the cast is exact"
    )]
    let raw = scaled as i64;
    Some(FixedQ32_32::from_raw(raw))
}

/// Converts a Q32.32 value to binary64, exactly when its raw magnitude is at most `2^53`.
///
/// Larger raw values round once to the nearest binary64 value. The demo uses this only for pixel
/// coordinates, which a 512-pixel viewport keeps far below that limit.
pub(super) fn fixed_to_f64(value: FixedQ32_32) -> f64 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "exact for raw magnitudes up to 2^53; larger values round once to nearest"
    )]
    let raw = value.raw() as f64;
    raw / RAW_PER_UNIT
}

/// Converts a pixel count to the Q32.32 value with that many whole units.
///
/// Returns `None` when the count is `2^31` or more, which Q32.32 cannot hold.
pub(super) fn fixed_from_u32(value: u32) -> Option<FixedQ32_32> {
    i64::from(value)
        .checked_mul(1 << 32)
        .map(FixedQ32_32::from_raw)
}

#[cfg(test)]
mod tests {
    use super::{fixed_from_f64, fixed_from_u32, fixed_to_f64};
    use bunny_num::FixedQ32_32;

    // Oracle for every test here: the exact value `raw / 2^32` worked out by hand.

    #[test]
    fn ingress_maps_dyadic_values_to_their_exact_raw_units() {
        assert_eq!(fixed_from_f64(1.0), Some(FixedQ32_32::ONE));
        assert_eq!(fixed_from_f64(0.5), Some(FixedQ32_32::from_raw(1 << 31)));
        assert_eq!(
            fixed_from_f64(-0.25),
            Some(FixedQ32_32::from_raw(-(1 << 30)))
        );
        assert_eq!(fixed_from_f64(-0.0), Some(FixedQ32_32::ZERO));
    }

    #[test]
    fn ingress_rounds_half_raw_units_to_even() {
        let half_unit = 2.0_f64.powi(-33);
        assert_eq!(fixed_from_f64(half_unit), Some(FixedQ32_32::ZERO));
        assert_eq!(
            fixed_from_f64(3.0 * half_unit),
            Some(FixedQ32_32::from_raw(2))
        );
        assert_eq!(
            fixed_from_f64(-3.0 * half_unit),
            Some(FixedQ32_32::from_raw(-2))
        );
        assert_eq!(
            fixed_from_f64(5.0 * half_unit),
            Some(FixedQ32_32::from_raw(2))
        );
    }

    #[test]
    fn ingress_rounds_a_non_dyadic_value_to_the_nearest_raw_unit() {
        // 0.1 * 2^32 = 429496729.6 (the binary64 0.1 is slightly above 0.1), nearest is ...730.
        assert_eq!(
            fixed_from_f64(0.1),
            Some(FixedQ32_32::from_raw(429_496_730))
        );
    }

    #[test]
    fn ingress_refuses_non_finite_and_out_of_range_values() {
        assert_eq!(fixed_from_f64(f64::NAN), None);
        assert_eq!(fixed_from_f64(f64::INFINITY), None);
        assert_eq!(fixed_from_f64(f64::NEG_INFINITY), None);
        // 2^21 units is raw 2^53, one above the accepted maximum.
        assert_eq!(fixed_from_f64(2_097_152.0), None);
        assert_eq!(fixed_from_f64(-2_097_152.0), None);
        let largest = 2_097_152.0 - 2.0_f64.powi(-32);
        assert_eq!(
            fixed_from_f64(largest),
            Some(FixedQ32_32::from_raw(9_007_199_254_740_991))
        );
    }

    #[test]
    fn egress_is_the_exact_inverse_of_ingress_in_the_accepted_range() {
        for raw in [
            0,
            1,
            -1,
            1 << 31,
            429_496_730,
            -(1 << 41) - 7,
            9_007_199_254_740_991,
        ] {
            let value = FixedQ32_32::from_raw(raw);
            assert_eq!(
                fixed_from_f64(fixed_to_f64(value)),
                Some(value),
                "raw {raw}"
            );
        }
    }

    #[test]
    fn pixel_counts_become_whole_units() {
        assert_eq!(fixed_from_u32(0), Some(FixedQ32_32::ZERO));
        assert_eq!(fixed_from_u32(1), Some(FixedQ32_32::ONE));
        assert_eq!(fixed_from_u32(512), Some(FixedQ32_32::from_raw(512 << 32)));
        assert_eq!(
            fixed_from_u32(0x7fff_ffff),
            Some(FixedQ32_32::from_raw(0x7fff_ffff_i64 << 32))
        );
        assert_eq!(fixed_from_u32(0x8000_0000), None);
    }
}
