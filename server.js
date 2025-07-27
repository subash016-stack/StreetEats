const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/streeteats', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Schemas
const Vendor = mongoose.model('Vendor', new mongoose.Schema({
  fullName: String, email: String, phone: String, password: String,
  aadhar: String, gst: String, verified: { type: Boolean, default: false },
  shoploc: String, shopname: String
}));

const Supplier = mongoose.model('Supplier', new mongoose.Schema({
  fullName: String, email: String, phone: String, password: String,
  aadhar: String, gst: String, verified: { type: Boolean, default: false },
  shoploc: String, shopname: String,
   shopStatus: { type: Boolean, default: false }
}), 'suppliers');

const ItemSchema = new mongoose.Schema({
  name: String,
  price: Number,
  stock: Number
});

const SupplierStoreSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  items: [ItemSchema],
  lastUpdated: { type: Date, default: Date.now },
 
});

module.exports = mongoose.model('SupplierStore', SupplierStoreSchema);
const GrievanceSchema = new mongoose.Schema({
  supplierName: String,
  supplierShop: String,
  vendorName: String,
  vendorLocation: String,
  issueDate: Date,
  issueType: String,
  issueDetails: String,
  postedBy: { type: String, enum: ['vendor', 'supplier'], required: true }, // NEW
  attachments: [
    {
      filename: String,
      mimetype: String,
      content: String
    }
  ]
});

const Grievance = mongoose.model('Grievance', GrievanceSchema);



// Vendor & Supplier Registration/Login
app.post("/api/register", async (req, res) => {
  try {
    const vendor = new Vendor({ ...req.body });
    await vendor.save();
    res.json({ message: "Vendor registered" });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

app.post("/api/supplier/register", async (req, res) => {
  try {
    const supplier = new Supplier({ ...req.body });
    await supplier.save();
    res.json({ message: "Supplier registered" });
  } catch (err) {
    res.status(500).json({ error: "Supplier registration failed", details: err.message });
  }
});

app.post('/api/vendor/login', async (req, res) => {
  const { userId, password } = req.body;
  const user = await Vendor.findOne({ $or: [{ email: userId }, { phone: userId }] });
  if (!user || user.password !== password)
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({
    message: 'Login successful',
    role: 'vendor',
    name: user.name,
    gst: user.gst,
    shopname: user.shopname
  });
});

app.post('/api/supplier/login', async (req, res) => {
  const { userId, password } = req.body;
  const supplier = await Supplier.findOne({ $or: [{ email: userId }, { phone: userId }] });
  
  if (!supplier || supplier.password !== password)
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ message: 'Login successful', role: 'supplier', gst: supplier.gst , shopname : supplier.shopname });
});

// Grievance Submission
app.post('/api/grievance', upload.array('attachments'), async (req, res) => {
  try {
    const files = req.files?.map(file => ({
      filename: file.originalname,
      mimetype: file.mimetype,
      content: fs.readFileSync(file.path).toString('base64')
    })) || [];

    const grievance = new Grievance({
      ...req.body,
      attachments: files,
      postedBy: req.body.postedBy
    });

    await grievance.save();

    req.files?.forEach(file => fs.unlinkSync(file.path));
    res.json({ message: 'Grievance submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Grievance submission failed', details: err.message });
  }
});

// Grievance List with Filter


app.get('/api/grievances', async (req, res) => {
  try {
    const { postedBy } = req.query;

    // If filter is not 'all' and is provided, apply filter
    const filter = (postedBy && postedBy !== 'all') 
      ? { postedBy: postedBy.toLowerCase() } 
      : {};

    const grievances = await Grievance.find(filter).sort({ issueDate: -1 });

    res.status(200).json(grievances);
  } catch (err) {
    console.error("❌ Grievance Fetch Error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});






// Unverified Users
app.get('/api/unverified-users', async (req, res) => {
  try {
    const vendors = await Vendor.find({ verified: { $ne: true } });
    const suppliers = await Supplier.find({ verified: { $ne: true } });
    res.json({ vendors, suppliers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unverified users', details: err.message });
  }
});

// Verify User
app.post('/api/verify-user', async (req, res) => {
  const { userType, id } = req.body;
  try {
    if (userType === 'vendor') await Vendor.findByIdAndUpdate(id, { verified: true });
    else if (userType === 'supplier') await Supplier.findByIdAndUpdate(id, { verified: true });
    res.json({ message: 'User verified' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed', details: err.message });
  }
});

// Reject (Delete) User
app.delete('/api/reject-user/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  try {
    if (type === 'vendor') await Vendor.findByIdAndDelete(id);
    else if (type === 'supplier') await Supplier.findByIdAndDelete(id);
    res.json({ message: 'User rejected and deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Rejection failed', details: err.message });
  }
});

// Fetch All Users (for dashboard)
app.get('/api/all-users', async (req, res) => {
  try {
    const vendors = await Vendor.find({}, '-password');
    const suppliers = await Supplier.find({}, '-password');
    res.json({ vendors, suppliers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all users', details: err.message });
  }
});

const Menu = mongoose.model('Menu', new mongoose.Schema({
  phone: String, // link to supplier login
  shopname: String,
  gst: String,
  itemname: String,
  itemcost: Number,
  todaysstock: Number
}));

app.post('/api/supplier/login', async (req, res) => {
  const { userId, password } = req.body;
  const supplier = await Supplier.findOne({ $or: [{ email: userId }, { phone: userId }] });

  if (!supplier || supplier.password !== password)
    return res.status(401).json({ error: 'Invalid credentials' });

  res.json({
    message: 'Login successful',
    role: 'supplier',
    gst: supplier.gst,
    shopname: supplier.shopname,
    phone: supplier.phone
  });
});


// Add this route for updating shop status
app.post('/api/supplier/shop-status', async (req, res) => {
  try {
    const { phone, status } = req.body;

    // Validate input
    if (!phone || typeof status !== 'boolean') {
      return res.status(400).json({ error: 'Phone and status (boolean) are required' });
    }

    // Update the supplier's shopStatus
    const updatedSupplier = await Supplier.findOneAndUpdate(
      { phone: phone },
      { shopStatus: status },
      { new: true } // Return the updated document
    );

    if (!updatedSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json({ 
      message: 'Shop status updated successfully',
      isShopOpen: updatedSupplier.shopStatus
    });

  } catch (err) {
    console.error('❌ Error updating shop status:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/supplier/store/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const items = await Menu.find({ phone }); // assuming 'Menu' is your menu model
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items', details: err.message });
  }
});


// Menu Item Add
app.post('/api/supplier/menu', async (req, res) => {
  try {
    const { phone, shopname, gst, itemname, itemcost, todaysstock } = req.body;

    // Validate required fields
    if (!phone || !shopname || !gst || !itemname || !itemcost || !todaysstock) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Create new menu item
    const newMenuItem = new Menu({
      phone,
      shopname,
      gst,
      itemname,
      itemcost: Number(itemcost),
      todaysstock: Number(todaysstock)
    });

    await newMenuItem.save();

    res.status(201).json({
      success: true,
      message: 'Menu item added successfully',
      menuItem: {
        id: newMenuItem._id,
        itemname: newMenuItem.itemname,
        price: newMenuItem.itemcost,
        stock: newMenuItem.todaysstock
      }
    });

  } catch (err) {
    console.error('❌ Menu item save error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save menu item',
      details: err.message 
    });
  }
});

// Get Menu Items by Supplier Phone
app.get('/api/supplier/menu/:phone', async (req, res) => {
  try {
    const items = await Menu.find({ phone: req.params.phone })
                          .sort({ createdAt: -1 });

    if (!items || items.length === 0) {
      return res.status(404).json({ 
        message: 'No menu items found for this supplier' 
      });
    }

    res.json({
      success: true,
      count: items.length,
      menuItems: items.map(item => ({
        id: item._id,
        name: item.itemname,
        price: item.itemcost,
        stock: item.todaysstock,
        addedOn: item.createdAt
      }))
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch menu items',
      details: err.message 
    });
  }
});


// Fetch menu items by supplier GST
const vendorCartSchema = new mongoose.Schema({
  itemId: String,
  itemname: String,
  itemcost: Number,
  quantity: Number,
  supplierShop: String,
  supplierGst: String,
  vendorName: String,
  vendorShop: String,
  vendorGst: String,
  timestamp: { type: Date, default: Date.now }
});


app.post('/api/vendorcart', async (req, res) => {
  try {
    const {
      itemId,
      itemname,
      itemcost,
      quantity,
      supplierShop,
      supplierGst,
      vendorName,
      vendorShop,
      vendorGst
    } = req.body;

    if (!itemId || !itemname || !vendorName || !vendorShop || !vendorGst) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newCartEntry = new VendorCart({
      itemId,
      itemname,
      itemcost,
      quantity,
      supplierShop,
      supplierGst,
      vendorName,
      vendorShop,
      vendorGst
    });

    await newCartEntry.save();
    res.json({ message: 'Item added to cart successfully' });

  } catch (err) {
    console.error('Vendor Cart Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// ✅ Correct route to fetch menus by supplier ID
app.get('/api/menus/:supplierId', async (req, res) => {
  try {
    const supplierId = req.params.supplierId;

    const menus = await Menu.find({ gst: supplierId }); // or supplierPhone, depending on your schema
    res.json(menus);
  } catch (err) {
    console.error("❌ Failed to fetch menus:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
