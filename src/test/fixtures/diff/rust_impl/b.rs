/// Adds two numbers, saturating on overflow.
pub fn add(a: i32, b: i32) -> i32 {
    a.saturating_add(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saturates() {
        assert_eq!(add(i32::MAX, 1), i32::MAX);
    }
}
