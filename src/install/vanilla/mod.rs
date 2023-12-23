use serde_json::Value;

use crate::HTTP_CLIENT;

use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct Version {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

impl Version {
    pub async fn new(version: String) -> anyhow::Result<Self> {
        let raw_data: Value = HTTP_CLIENT
            .get(format!(
                "https://bmclapi2.bangbang93.com/version/{version}/json"
            ))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let server = raw_data.get("downloads").unwrap().get("server").unwrap();
        Ok(Self {
            sha1: server.get("sha1").unwrap().as_str().unwrap().to_string(),
            size: server.get("size").unwrap().as_u64().unwrap(),
            url: server.get("url").unwrap().as_str().unwrap().to_string(),
        })
    }
}

#[tokio::test]
async fn test() {
    let a = Version::new("1.16.5".to_string()).await.unwrap();
    println!("{:#?}", a);
}