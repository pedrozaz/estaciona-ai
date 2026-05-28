use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

// Anonimação de placas
pub fn hash_plate(plate: &str, pepper: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(pepper.as_bytes()).expect("HMAC can take key of any size");

    let normalized_plate = plate.to_uppercase().replace("-", "").replace(" ", "");

    mac.update(normalized_plate.as_bytes());
    let result = mac.finalize();
    let bytes = result.into_bytes();

    use std::fmt::Write;
    let mut hex_string = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        write!(&mut hex_string, "{:02x}", b).unwrap();
    }

    hex_string
}

// Segurança de senhas com Argon2
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string();

    Ok(password_hash)
}

pub fn verify_password(password: &str, password_hash: &str) -> bool {
    let parsed_hash = match PasswordHash::new(password_hash) {
        Ok(hash) => hash,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

// Autenticação de sessão com JWT
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,  // ID
    pub role: String, // Função
    pub exp: usize,   // Timestamp
}

pub fn create_jwt(
    subject: &str,
    role: &str,
    secret: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = Utc::now()
        .checked_add_signed(Duration::hours(24))
        .expect("Invalid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: subject.to_owned(),
        role: role.to_owned(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn verify_jwt(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}
