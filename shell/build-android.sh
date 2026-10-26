#!/usr/bin/env bash

set -e

APK_DIR="apk"
VERSION=$(npm pkg get version | tr -d '"')
VERSION_DIR="$APK_DIR/v$VERSION"

KEYSTORE="test.keystore"
ALIAS="test"

echo "Software version: $VERSION"

# Clean old version folder or create new one
if [ -d "$VERSION_DIR" ]; then
    echo "Version $VERSION already exists, removing old files..."
    rm -rf "$VERSION_DIR"
fi

mkdir -p "$VERSION_DIR"

rm -f "$KEYSTORE"

read -p "Keystore alias [$ALIAS]: " INPUT_ALIAS
if [ -n "$INPUT_ALIAS" ]; then
    ALIAS="$INPUT_ALIAS"
fi

read -p "Your name (CN): " CN
read -p "Organization (O): " ORG
read -p "Country code (C): " COUNTRY

read -s -p "Keystore password: " STORE_PASSWORD
echo


echo "================================"
echo "Creating new keystore"
echo "================================"

keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASSWORD" \
    -keypass "$STORE_PASSWORD" \
    -dname "CN=$CN, O=$ORG, C=$COUNTRY"


echo "Keystore created: $KEYSTORE"
echo "================================"
echo "Building Android APKs"
echo "================================"


declare -A TARGETS=(
    ["aarch64"]="app-aarch64-linux-android.apk"
    ["armv7"]="app-armv7-linux-androideabi.apk"
    ["i686"]="app-i686-linux-android.apk"
    ["x86_64"]="app-x86_64-linux-android.apk"
)


for TARGET in "${!TARGETS[@]}"; do

    OUTPUT_NAME="${TARGETS[$TARGET]}"

    echo
    echo "Building $TARGET..."

    npm run android:tauri -- android build --target "$TARGET"


    echo "Collecting $TARGET APK..."

    APK=$(find src-tauri/gen/android/app/build/outputs/apk \
        -name "*.apk" \
        -type f \
        | head -n 1)


    if [ -z "$APK" ]; then
        echo "No APK found for $TARGET"
        exit 1
    fi


    cp "$APK" "$VERSION_DIR/$OUTPUT_NAME"


    echo "Saved:"
    echo "$VERSION_DIR/$OUTPUT_NAME"

done


echo "================================"
echo "Signing APKs"
echo "================================"


FOUND=false


for APK in "$VERSION_DIR"/*.apk; do

    if [ ! -f "$APK" ]; then
        continue
    fi


    if [[ "$APK" == *"-signed.apk" ]]; then
        continue
    fi


    FOUND=true


    NAME=$(basename "$APK" .apk)
    OUT="$VERSION_DIR/${NAME}-signed.apk"


    echo
    echo "Signing $APK"


    apksigner sign \
        --ks "$KEYSTORE" \
        --ks-key-alias "$ALIAS" \
        --ks-pass "pass:$STORE_PASSWORD" \
        --v4-signing-enabled false \
        --out "$OUT" \
        "$APK"


    echo "Created:"
    echo "$OUT"


    rm -f "$APK"
    rm -f "${OUT}.idsig"

done


if [ "$FOUND" = false ]; then
    echo "No APK files found!"
    exit 1
fi

echo "================================"
echo "Building Universal APK"
echo "================================"

npm run android:tauri -- android build

echo "Collecting Universal APK..."

UNIVERSAL_APK=$(find src-tauri/gen/android/app/build/outputs/apk \
    -name "*.apk" \
    -type f \
    | head -n 1)

if [ -z "$UNIVERSAL_APK" ]; then
    echo "No Universal APK found"
    exit 1
fi

cp "$UNIVERSAL_APK" "$VERSION_DIR/app-universal.apk"

echo "Saved:"
echo "$VERSION_DIR/app-universal.apk"

apksigner sign \
    --ks "$KEYSTORE" \
    --ks-key-alias "$ALIAS" \
    --ks-pass "pass:$STORE_PASSWORD" \
    --v4-signing-enabled false \
    --out "$VERSION_DIR/app-universal-signed.apk" \
    "$VERSION_DIR/app-universal.apk"

rm -f "$VERSION_DIR/app-universal.apk"
rm -f "$VERSION_DIR/app-universal-signed.apk.idsig"

echo "Created:"
echo "$VERSION_DIR/app-universal-signed.apk"

echo
echo "================================"
echo "Finished"
echo "================================"


ls -lh "$VERSION_DIR"/*signed.apk