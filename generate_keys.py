import os
import sys
import json
import base64
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

# 鍵の保存先 (バージョン v1)
VERSION = "v1"
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PRIVATE_KEY_PATH = os.path.join(DIRECTORY, f"private_key_{VERSION}.pem")
PUBLIC_KEY_PATH = os.path.join(DIRECTORY, "web", f"public_key_{VERSION}.json")

def to_base64url(val: int) -> str:
    """整数の値を Big-endian バイト列に変換し、Base64URLエンコード（パディングなし）する"""
    bytes_len = (val.bit_length() + 7) // 8
    b = val.to_bytes(bytes_len, byteorder='big')
    return base64.urlsafe_b64encode(b).decode('utf-8').rstrip('=')

def main():
    print("=== Antigravity RSA-3072 Key Generator ===")
    
    # 1. 鍵上書き防止ガード
    if os.path.exists(PRIVATE_KEY_PATH) or os.path.exists(PUBLIC_KEY_PATH):
        print(f"[🚨 ERROR] 鍵ファイルが既に存在します。過去の回答が復号できなくなるのを防ぐため、生成を中止しました。")
        print(f"  - 秘密鍵: {PRIVATE_KEY_PATH} (存在: {os.path.exists(PRIVATE_KEY_PATH)})")
        print(f"  - 公開鍵: {PUBLIC_KEY_PATH} (存在: {os.path.exists(PUBLIC_KEY_PATH)})")
        sys.exit(1)

    print("[*] RSA-3072 鍵ペアを生成中...")
    # 2. RSA-3072 鍵ペアの生成
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=3072
    )
    public_key = private_key.public_key()
    
    # 3. 秘密鍵を PEM 形式で保存
    print(f"[*] 秘密鍵を保存中 -> {PRIVATE_KEY_PATH}")
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    with open(PRIVATE_KEY_PATH, "wb") as f:
        f.write(private_pem)

    # 4. 公開鍵を JWK (JSON Web Key) 形式に変換
    print(f"[*] 公開鍵を JWK 形式に変換中...")
    numbers = public_key.public_numbers()
    jwk = {
        "kty": "RSA",
        "alg": "RSA-OAEP-256", # Web Crypto API 用のアルゴリズム識別子
        "n": to_base64url(numbers.n),
        "e": to_base64url(numbers.e),
        "key_ops": ["encrypt"],
        "ext": True
    }
    
    # 5. 公開鍵を保存
    print(f"[*] 公開鍵を保存中 -> {PUBLIC_KEY_PATH}")
    with open(PUBLIC_KEY_PATH, "w", encoding="utf-8") as f:
        json.dump(jwk, f, ensure_ascii=False, indent=2)
        
    print("\n[SUCCESS] 鍵ペアの生成と保存が完了しました。")
    print(f"  - 秘密鍵: private_key_{VERSION}.pem")
    print(f"  - 公開鍵: web/public_key_{VERSION}.json")

if __name__ == "__main__":
    main()
