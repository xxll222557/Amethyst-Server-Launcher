use once_cell::sync::Lazy;
use reqwest::Client;

pub mod install;
pub mod instance;
pub static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| Client::new());

#[macro_use]
extern crate rocket;

#[get("/")]
fn index() -> &'static str {
    "Hello, world!"
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![index])
}
