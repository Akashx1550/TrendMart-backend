require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const cors = require('cors');
const Users = require('./model/users')
const Product = require('./model/product')
const PORT = process.env.PORT || 5000;
const atlasConnectionUri = process.env.MONGODB_URI;

app.use(express.json());

app.use(cors({
    origin: ['https://trend-mart-frontend.vercel.app', 'https://trend-mart-admin.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

//CORS Preflight handling
app.options('*', cors({
    origin: ['https://trend-mart-frontend.vercel.app', 'https://trend-mart-admin.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Configure Cloudinary
const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage engine for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'upload/images', // Optional - specify the folder where Cloudinary should store the images
        public_id: (req, file) => `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`,
    },
});

const upload = multer({ storage: storage });

// Serve static images from Cloudinary
app.use('/images', express.static('upload/images'));

// Route for uploading images
app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: true,
        image_url: req.file.path // Cloudinary stores the URL in req.file.path
    });
});

//API creation
app.get("/", (req, res) => {
    res.send("Express app is running");
})

//API for adding products
app.post("/addproduct", async (req, res) => {

    let products = await Product.find({});
    let id;
    if (products.length > 0) {
        let last_product_array = products.slice(-1);
        let last_product = last_product_array[0];
        id = last_product.id + 1;
    } else {
        id = 1;
    }
    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image,
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
    });

    console.log(product);
    await product.save();
    console.log("saved!");
    res.json({
        success: true,
        name: req.body.name,
    })
})

//API for deleting products

app.post("/removeproduct", async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    console.log("Product removed!");
    res.json({
        success: true,
        name: req.body.name
    })
})

//API for getting all products

app.get("/allproducts", async (req, res) => {
    let products = await Product.find({});
    console.log("All products fetched!");
    res.send(products);
})

//Creating API for registering users

app.post("/signup", async (req, res) => {
    let check = await Users.findOne({ email: req.body.email });

    if (check) {
        return res.status(400).json({
            success: false,
            errors: "Existing user already registered with same email address"
        })
    }

    let cart = {};

    for (let i = 0; i < 300; i++) {
        cart[i] = 0;
    }

    const user = new Users({
        name: req.body.username,
        email: req.body.email,
        password: req.body.password,
        cartData: cart,
    })

    await user.save();

    const data = {
        user: {
            id: user.id
        }
    }

    const token = jwt.sign(data, "secret");

    res.json({ success: true, token: token });
})

//API for user login

app.post('/login', async (req, res) => {
    let user = await Users.findOne({ email: req.body.email });

    if (user) {
        const passCompare = req.body.password === user.password;

        if (passCompare) {
            const data = {
                user: {
                    id: user.id
                }
            }

            const token = jwt.sign(data, "secret");

            res.json({ success: true, token: token });
        }
        else {
            res.json({ success: false, errors: "Wrong password" });
        }
    }

    else {
        res.json({ success: false, errors: "Wrong email Id" })
    }
})

//API for new collection data
app.get("/newcollections", async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    console.log("New collection fetched!");
    res.send(newcollection);
})

//API for popular in women category
app.get("/popularinwomen", async (req, res) => {
    let products = await Product.find({ category: "women" });

    let popular_in_women = products.slice(0, 4);
    console.log("Popular in women fetched!");
    res.send(popular_in_women);
})

//API for related products data
app.get("/relatedproducts/:category", async (req, res) => {
    const { category } = req.params;
    console.log(category)
    let products = await Product.find({ category: category });

    // Shuffle the products
    products = products.sort(() => 0.5 - Math.random());
    let newcollection = products.slice(1).slice(-4);
    console.log("Related products fetched!");
    res.send(newcollection);
})

//Creating middleware to fetch user

const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');

    if (!token) {
        res.status(401).send({ errors: "Please authenticate using a valid token" })
    }
    else {
        try {
            const data = jwt.verify(token, 'secret');
            req.user = data.user;
            next();
        } catch (error) {
            res.status(401).send({ errors: "Please authenticate using a valid token" })
        }
    }
}

//API for adding products in cartData

app.post("/addtocart", fetchUser, async (req, res) => {
    console.log("added", req.body.itemId);
    let userData = await Users.findOne({ _id: req.user.id });
    userData.cartData[req.body.itemId] += 1;
    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Added");
})

//API to remove product from cartData
app.post("/removefromcart", fetchUser, async (req, res) => {
    console.log("removed", req.body.itemId);
    let userData = await Users.findOne({ _id: req.user.id });
    if (userData.cartData[req.body.itemId] > 0) {
        userData.cartData[req.body.itemId] -= 1;
    }
    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("removed");
})


//API to get cart Data

app.post("/getcart", fetchUser, async (req, res) => {
    console.log("Get cart");

    let userData = await Users.findOne({ _id: req.user.id });
    res.json(userData.cartData);
})


//Database connection with mongoDB
mongoose.connect(atlasConnectionUri).then(() => {
    app.listen(PORT, (error) => {

        if (!error) {
            console.log("Server listening on port: " + PORT);
        } else {
            console.log("Error: " + error)
        }
    })
})
    .catch((err) => {
        console.log("Error connecting to database");
    })