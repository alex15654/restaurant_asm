const express = require('express')
const bodyParser = require('body-parser')
const fileUpload = require('express-fileupload');
const path = require('path');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const MongoClient = require('mongodb').MongoClient
const {body, validationResult} = require('express-validator');
const imageToBase64 = require('image-to-base64');

const app = express()
var ObjectId = require('mongodb').ObjectID;
var fs = require('fs');
// SET OUR VIEWS AND VIEW ENGINE
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(cookieSession({
    name: 'session',
    keys: ['key1', 'key2'],
    maxAge: 3600 * 1000 // 1hr
}));

require('./dotenv')

// Replace process.env.DB_URL with your actual connection string
const connectionString = process.env.DB_URL

function base64_encode(file) {
    // read binary data
    var bitmap = fs.readFileSync(file);
    // convert binary data to base64 encoded string
    return new Buffer(bitmap).toString('base64');
}


function updateRecord(body) {
    console.log(body);
}

// DECLARING CUSTOM MIDDLEWARE
const ifNotLoggedin = (req, res, next) => {
    if (!req.session.isLoggedIn) {
        return res.render('login.ejs');
    }

    res.locals.userID = req.session.userID;
    res.locals.userName = req.session.userName;

    next();
}

const ifLoggedin = (req, res, next) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/');
    }
    next();
}
// END OF CUSTOM MIDDLEWARE

MongoClient.connect(connectionString, {useUnifiedTopology: true})
    .then(client => {
        console.log('Connected to Database')
        const db = client.db('restaurant-document')
        const restaurantCollection = db.collection('restaurant')

        // ========================
        // Middlewares
        // ========================
        app.set('view engine', 'ejs')
        app.use(bodyParser.urlencoded({extended: true}))
        app.use(bodyParser.json())
        app.use(fileUpload({
            createParentPath: true
        }));
        app.use(express.static('public'))

        // ========================
        // Routes
        // ========================
        app.get('/', ifNotLoggedin, (req, res, next) => {
            db.collection('restaurant').find().toArray()
                .then(restaurants => {
                    res.render('index.ejs', {restaurants: restaurants})
                })
                .catch(/* ... */)
        })
        app.get('/restaurant/display', ifNotLoggedin, (req, res, next) => {
            let link = req.protocol + '://' + req.get('host');

            console.log(req.query.id)
            db.collection('restaurant').findOne({_id: ObjectId(req.query.id)}).then(restaurant => {
                res.render('view.ejs', {restaurant: restaurant, link: link})
            })
        })

        app.get('/restaurant/add', ifNotLoggedin, (req, res, next) => {
            let link = req.protocol + '://' + req.get('host');
            res.render('add.ejs', {link: link})
        })

        app.post('/restaurant/add', (req, res) => {
            let name = req.body.name;
            let borough = req.body.borough;
            let cuisine = req.body.cuisine;
            let street = req.body.street;
            let building = req.body.building;
            let zipcode = req.body.zipcode;
            let lat = req.body.lat;
            let long = req.body.long;
            let photo = null;
            let photo_minetype = null;


            restaurantCollection.insertOne({
                name: name,
                borough: borough,
                cuisine: cuisine,
                address: {
                    street: street,
                    building: building,
                    zipcode: zipcode,
                    coord: [
                        req.body.lat,
                        req.body.long
                    ],
                },
                owner: {
                    id: req.session.userID,
                    name: req.session.userName
                }
            })
                .then(result => {
                    if (req.files && req.files.photo) {
                        var photofile = req.files.photo;
                        photofile.mv(__dirname + '/images/' + photofile.name, function (err) {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log("uploaded");
                                restaurantCollection.updateOne(
                                    {_id: ObjectId(result.ops[0]._id)},
                                    {
                                        $set: {
                                            photo: photofile.data.toString('base64'),
                                            photo_minetype: photo_minetype,
                                        }
                                    },
                                    {
                                        upsert: true
                                    }
                                )
                                    .catch(error => console.error(error))
                            }
                        });
                    }
                    res.redirect('/')
                })
                .catch(error => console.error(error))

        })
        app.get('/restaurant/update', ifNotLoggedin, ((req, res, next) => {
            let link = req.protocol + '://' + req.get('host');
            console.log(req.query.id)
            db.collection('restaurant').findOne({_id: ObjectId(req.query.id)}).then(restaurant => {
                if (req.session.userID != restaurant.owner.id)
                    res.render("not_arrow", {id: restaurant._id});
                else
                    res.render('edit.ejs', {restaurant: restaurant, link: link})
            })
        }))
        app.post('/restaurant/update', (req, res) => {
                let link = req.protocol + '://' + req.get('host');
                let photo_path = null;
                let photo_minetype = null;
                if (req.files && req.files.photo) {
                    var photofile = req.files.photo;
                    photofile.mv(__dirname + '/images/' + photofile.name, function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("uploaded");
                            restaurantCollection.updateOne(
                                {_id: ObjectId(req.body.id)},
                                {
                                    $set: {
                                        photo: photofile.data.toString('base64'),
                                        photo_minetype: photo_minetype,
                                    }
                                },
                                {
                                    upsert: true
                                }
                            )
                                .catch(error => console.error(error))
                        }
                    });
                    // Use the mv() method to place the file somewhere on your server

                }
                restaurantCollection.updateOne(
                    {_id: ObjectId(req.body.id)},
                    {
                        $set: {
                            name: req.body.name,
                            borough: req.body.borough,
                            cuisine: req.body.cuisine,
                            address: {
                                street: req.body.street,
                                building: req.body.building,
                                zipcode: req.body.zipcode,
                                coord: [
                                    req.body.lat,
                                    req.body.long
                                ],
                            },
                        }
                    },
                    {
                        upsert: true
                    }
                )
                    .then(result => res.render(
                        'update.ejs',
                        {
                            id: req.body.id,
                            link: link,
                            name: req.session.userName
                        }
                    ))
                    .catch(error => console.error(error))
            }
        )

        app.get('/restaurant/delete', ifNotLoggedin, (req, res, next) => {
            let link = req.protocol + '://' + req.get('host');
            restaurantCollection.deleteOne(
                {
                    _id: ObjectId(req.query.id),
                    'owner.id':req.session.userID != restaurant
                }
            )
                .then(result => {
                    if (result.deletedCount === 0) {
                        res.render('error.ejs', {id: req.query.id, link: link})
                    }
                    res.render('delete.ejs', {id: req.query.id, link: link})
                })
                .catch(error => console.error(error))
        })

        app.get('/api/restaurant/:type/:value', ((req, res) => {
            switch (req.params.type) {
                case 'borough':
                    db.collection('restaurant').find({borough: req.params.value}).toArray().then(restaurants => {
                        if (restaurants.length > 0)
                            res.json(restaurants)
                        else
                            res.send({})
                    });
                    break;
                case 'cuisine':
                    db.collection('restaurant').find({borough: req.params.value}).toArray().then(restaurants => {
                        if (restaurants.length > 0)
                            res.json(restaurants)
                        else
                            res.send({})
                    });
                    break;
                case 'name':
                    db.collection('restaurant').find({borough: req.params.value}).toArray().then(restaurants => {
                        if (restaurants.length > 0)
                            res.json(restaurants)
                        else
                            res.send({})
                    });
                    break;
                default:
                    res.status(404).send('Type Not found');

            }
        }));

        app.get('/register', ifLoggedin, (req, res, next) => {
            res.render('register')
        });
// REGISTER PAGE
        app.post('/register', ifLoggedin,
// post data validation(using express-validator)
            [
                body('user_name', 'Invalid email address!').custom((value) => {
                    return db.collection('users').findOne({username: value})
                        .then(result => {
                            if (result != null) {
                                return Promise.reject('This username already in use!');
                            }
                            return true;
                        });
                }),
                body('user_name', 'Username is Empty!').trim().not().isEmpty(),
                //body('user_pass', 'The password must be of minimum length 6 characters').trim().isLength({min: 6}),
            ],// end of post data validation
            (req, res, next) => {

                const validation_result = validationResult(req);
                const {user_name, user_pass} = req.body;
                // IF validation_result HAS NO ERROR
                if (validation_result.isEmpty()) {
                    // password encryption (using bcryptjs)
                    bcrypt.hash(user_pass, 12).then((hash_pass) => {
                        // INSERTING USER INTO DATABASE
                        db.collection('users').insertOne({
                            username: user_name,
                            password: hash_pass
                        })
                            .then(result => {
                                res.render('register.ejs', {login_success: 'your account has been created successfully, Now you can <a href="/">Login</a>'});
                            }).catch(err => {
                            // THROW INSERTING USER ERROR'S
                            if (err) throw err;
                        });
                    })
                        .catch(err => {
                            // THROW HASING ERROR'S
                            if (err) throw err;
                        })
                } else {
                    // COLLECT ALL THE VALIDATION ERRORS
                    let allErrors = validation_result.errors.map((error) => {
                        return error.msg;
                    });
                    // REDERING login-register PAGE WITH VALIDATION ERRORS
                    res.render('register.ejs', {
                        register_error: allErrors,
                        old_data: req.body
                    });
                }
            });// END OF REGISTER PAGE

        app.post('/login', ifLoggedin, [
            body('user_name').custom((value) => {
                console.log([value], value)
                return db.collection('users').findOne({
                    username: value
                })
                    .then(result => {
                        if (result != null) {
                            return true;
                        }
                        return Promise.reject('Incorrect credentials!');
                    });
            }),
            //body('user_pass', 'Password is empty!').trim().not().isEmpty(),
        ], (req, res) => {
            const validation_result = validationResult(req);
            const {user_pass, user_name} = req.body;
            if (validation_result.isEmpty()) {
                db.collection('users').findOne({
                    username: user_name
                })
                    .then(result => {
                        bcrypt.compare(user_pass, result.password).then(compare_result => {
                            if (compare_result === true) {
                                req.session.isLoggedIn = true;
                                req.session.userID = result._id;
                                req.session.userName = result.username
                                res.redirect('/');
                            } else {
                                res.render('login', {
                                    login_errors: ['Incorrect credentials!']
                                });
                            }
                        })
                    });
            } else {
                let allErrors = validation_result.errors.map((error) => {
                    return error.msg;
                });
                // REDERING login-register PAGE WITH LOGIN VALIDATION ERRORS
                res.render('login', {
                    login_errors: allErrors
                });
            }
        });
// END OF LOGIN PAGE

// LOGOUT
        app.get('/logout', (req, res) => {
            //session destroy
            req.session = null;
            res.redirect('/');
        });
// END OF LOGOUT

        // ========================
        // Listen
        // ========================
        const isProduction = process.env.NODE_ENV === 'production'
        const port = isProduction ? 7000 : 3000
        app.listen(port, function () {
            console.log(`listening on ${port}`)
        })
    })
    .catch(console.error)
