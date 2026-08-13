use aws_config::BehaviorVersion;
use aws_sdk_s3::{
    Client,
    config::{Credentials, Region},
    primitives::ByteStream,
};
use std::env;

pub type R2Result<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Clone)]
pub struct R2Storage {
    client: Client,
    bucket: String,
}

impl R2Storage {
    pub async fn from_env() -> R2Result<Self> {
        let account_id = env::var("R2_ACCOUNT_ID")?;

        let access_key_id = env::var("R2_ACCESS_KEY_ID")?;

        let secret_access_key = env::var("R2_SECRET_ACCESS_KEY")?;

        let bucket = env::var("R2_BUCKET")?;

        let endpoint = format!("https://{account_id}.r2.cloudflarestorage.com");

        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "cloudflare-r2",
        );

        let sdk_config = aws_config::defaults(BehaviorVersion::latest())
            .endpoint_url(endpoint)
            .region(Region::new("auto"))
            .credentials_provider(credentials)
            .load()
            .await;

        let client = Client::new(&sdk_config);

        Ok(Self { client, bucket })
    }

    pub async fn upload_avif(&self, key: &str, bytes: Vec<u8>) -> R2Result<()> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(bytes))
            .content_type("image/avif")
            .content_disposition("inline")
            /*
             * Prevent the browser from indefinitely showing
             * the old image when the same key is overwritten.
             */
            .cache_control("public, max-age=0, must-revalidate")
            .send()
            .await?;

        Ok(())
    }

    pub async fn delete_object(&self, key: &str) -> R2Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        Ok(())
    }

    pub async fn delete_objects(
        &self,
        keys: &[String],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if keys.is_empty() {
            return Ok(());
        }

        let objects = keys
            .iter()
            .map(|key| {
                aws_sdk_s3::types::ObjectIdentifier::builder()
                    .key(key)
                    .build()
            })
            .collect::<Result<Vec<_>, _>>()?;

        let delete = aws_sdk_s3::types::Delete::builder()
            .set_objects(Some(objects))
            .build()?;

        self.client
            .delete_objects()
            .bucket(&self.bucket)
            .delete(delete)
            .send()
            .await?;

        Ok(())
    }

    pub async fn upload_svg(
        &self,
        key: &str,
        svg: Vec<u8>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(svg))
            .content_type("image/svg+xml; charset=utf-8")
            .cache_control("public, max-age=31536000, immutable")
            .send()
            .await?;

        Ok(())
    }
}
